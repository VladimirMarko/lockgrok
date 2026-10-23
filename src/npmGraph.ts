import { posix } from "node:path";
import { Minimatch } from "minimatch";
import type {
  DependencyCategory,
  DependencyEdge,
  DependencyGraph,
  DependencyReference,
  ResolvedNode,
} from "./model.js";

const categories: readonly DependencyCategory[] = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const normalize = (path: string): string =>
  posix.normalize(path).replace(/\/+$/, "") || ".";

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function optionalObject(
  value: unknown,
  field: string,
): Record<string, unknown> {
  return value === undefined ? {} : object(value, field);
}

function metadata(
  root: Record<string, unknown>,
  legacy: boolean,
): Map<string, Record<string, unknown>> {
  if (!legacy) {
    return new Map(
      Object.entries(object(root.packages, "packages")).map(([path, raw]) => [
        normalize(path),
        object(raw, `packages[${path}]`),
      ]),
    );
  }
  const entries = new Map<string, Record<string, unknown>>([[".", {}]]);
  const ancestors = new Set<object>();
  const visit = (value: unknown, parent: string, field: string): void => {
    const dependencies = optionalObject(value, field);
    if (ancestors.has(dependencies)) {
      throw new Error(`${field} contains a cyclic dependency object.`);
    }
    ancestors.add(dependencies);
    for (const [name, raw] of Object.entries(dependencies)) {
      const entry = object(raw, `${field}.${name}`);
      const path = normalize(posix.join(parent, "node_modules", name));
      entries.set(path, entry);
      visit(entry.dependencies, path, `${field}.${name}.dependencies`);
    }
    ancestors.delete(dependencies);
  };
  visit(root.dependencies, ".", "dependencies");
  return entries;
}

/** Match lockfile paths with the same exclusion rules as npm's virtual workspace mapper. */
function workspaceMatcher(value: unknown): (path: string) => boolean {
  if (value === undefined) return () => false;
  const patterns = Array.isArray(value)
    ? value
    : object(value, "workspaces").packages;
  if (!Array.isArray(patterns)) {
    throw new Error("workspaces must be an array or contain a packages array.");
  }
  const positive: Minimatch[] = [];
  let negative: Minimatch[] = [];
  for (const raw of patterns) {
    if (typeof raw !== "string") {
      throw new Error("workspace patterns must be strings.");
    }
    const bangs = /^!+/.exec(raw)?.[0].length ?? 0;
    const pattern = raw
      .slice(bangs)
      .replace(/^\.?\/+/, "")
      .replace(/\/+$/, "");
    const matcher = new Minimatch(pattern, { platform: "linux" });
    if (bangs % 2 === 1) {
      negative.push(matcher);
    } else {
      // npm permits a later positive pattern to remove an earlier exclusion.
      negative = negative.filter((excluded) => !excluded.match(pattern));
      positive.push(matcher);
    }
  }
  const included = positive.filter(
    (pattern) => !negative.some((excluded) => excluded.match(pattern.pattern)),
  );
  return (path) =>
    included.some((pattern) => pattern.match(path)) &&
    !negative.some((pattern) => pattern.match(path));
}

function linkResolver(
  entries: ReadonlyMap<string, Record<string, unknown>>,
): (path: string) => string | undefined {
  const links: { path: string; target: string }[] = [];
  for (const [path, entry] of entries) {
    if (entry.link !== undefined && typeof entry.link !== "boolean") {
      throw new Error(`packages[${path}].link must be a boolean.`);
    }
    if (!entry.link) continue;
    if (typeof entry.resolved !== "string" || entry.resolved.length === 0) {
      throw new Error(`packages[${path}].resolved must be a non-empty string.`);
    }
    const target = entry.resolved.replace(/^(?:link|file):/, "");
    if (!target) throw new Error(`Missing link target for ${path}.`);
    links.push({ path, target: normalize(target) });
  }
  links.sort(
    (a, b) => b.path.length - a.path.length || compare(a.path, b.path),
  );
  return (input) => {
    let path = normalize(input);
    const followed = new Set<string>();
    while (true) {
      const link = links.find(
        (entry) => path === entry.path || path.startsWith(`${entry.path}/`),
      );
      if (!link) return path;
      if (followed.has(link.path)) return undefined;
      followed.add(link.path);
      path = normalize(posix.join(link.target, path.slice(link.path.length)));
    }
  };
}

function ancestorDistance(base: string, location: string): number | undefined {
  // An artificial absolute origin keeps relative path calculations independent
  // of process.cwd(), including link targets outside the lockfile directory.
  const depth =
    Math.max(base.split("/").length, location.split("/").length) + 1;
  const anchor = `/${Array<string>(depth).fill("root").join("/")}`;
  const relative = posix.relative(
    posix.resolve(anchor, base),
    posix.resolve(anchor, location),
  );
  if (
    relative === ".." ||
    relative.startsWith("../") ||
    posix.isAbsolute(relative)
  ) {
    return undefined;
  }
  return relative === "" ? 0 : relative.split("/").length;
}

interface Consumer {
  readonly location: string;
  readonly entry: Record<string, unknown>;
  readonly field: string;
}

interface Candidate {
  readonly base: string;
  readonly to: string;
}

/** Build edges from declarations and installed resolution, never from install depth. */
export function buildNpmGraph(
  root: Record<string, unknown>,
  version: string,
  references: readonly DependencyReference[],
): DependencyGraph {
  const legacy = version === "1";
  const entries = metadata(root, legacy);
  const rootEntry = entries.get(".") ?? {};
  const isWorkspace = workspaceMatcher(
    legacy
      ? undefined
      : rootEntry.workspaces === undefined
        ? root.workspaces
        : rootEntry.workspaces,
  );
  const projectPaths = new Set([
    ".",
    ...[...entries.keys()].filter(
      (path) =>
        path !== "." &&
        !path.split("/").includes("node_modules") &&
        isWorkspace(path),
    ),
  ]);
  const realPath = linkResolver(entries);
  const nodes = new Map<string, ResolvedNode>();
  const consumers = new Map<string, Consumer>();
  const referenceNodes = new Map<string, string>();
  const refs = new Map<string, DependencyReference>();
  for (const reference of [...references].sort((a, b) => compare(a.id, b.id))) {
    const id = normalize(reference.id);
    const existing = refs.get(id);
    if (
      existing &&
      (existing.name !== reference.name ||
        existing.version !== reference.version)
    ) {
      throw new Error(`Conflicting npm references for ${id}.`);
    }
    refs.set(id, reference);
  }

  const consume = (id: string, location: string, fallback: string): void => {
    const path = entries.has(location) ? location : fallback;
    const entry = entries.get(path);
    if (entry) {
      consumers.set(id, { location, entry, field: `packages[${path}]` });
    }
  };
  const add = (
    id: string,
    reference: DependencyReference,
    location: string,
    fallback: string,
  ): void => {
    nodes.set(id, {
      id,
      name: reference.name,
      version: reference.version,
      location,
      ...(projectPaths.has(id) ? { label: id } : {}),
    });
    consume(id, location, fallback);
  };

  for (const path of projectPaths) {
    const entry = entries.get(path) ?? {};
    nodes.set(path, {
      id: path,
      name:
        typeof entry.name === "string" && entry.name.length > 0
          ? entry.name
          : `project:${path}`,
      version:
        typeof entry.version === "string" && entry.version.length > 0
          ? entry.version
          : "0.0.0",
      label: path,
      location: path,
    });
    consume(path, path, path);
  }

  const links = new Map<
    string,
    { id: string; reference: DependencyReference }[]
  >();
  const installed = new Set<string>();
  for (const [id, reference] of refs) {
    const location = realPath(id);
    if (entries.get(id)?.link === true && location !== undefined) {
      const group = links.get(location) ?? [];
      group.push({ id, reference });
      links.set(location, group);
    } else {
      add(id, reference, location ?? id, id);
      installed.add(id);
      referenceNodes.set(id, id);
    }
  }
  for (const [location, group] of links) {
    const preferredName = entries.get(location)?.name;
    const preferred =
      group.find((item) => item.reference.name === preferredName) ?? group[0];
    if (!preferred) continue;
    if (!installed.has(location)) {
      add(location, preferred.reference, location, preferred.id);
    }
    const canonical = nodes.get(location);
    if (!canonical) continue;
    for (const item of group) {
      if (
        item.reference.name === canonical.name &&
        item.reference.version === canonical.version
      ) {
        referenceNodes.set(item.id, location);
      } else {
        add(item.id, item.reference, location, item.id);
        referenceNodes.set(item.id, item.id);
      }
    }
  }

  const candidates = new Map<string, Candidate[]>();
  for (const [id] of refs) {
    const match = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(id);
    const alias = match?.[1];
    const to = referenceNodes.get(id);
    if (!match || !alias || !to) continue;
    const base = realPath(id.slice(0, match.index));
    if (base === undefined || posix.basename(base) === "node_modules") continue;
    const items = candidates.get(alias) ?? [];
    items.push({ base, to });
    candidates.set(alias, items);
  }
  const resolve = (location: string, alias: string): string | undefined => {
    let distance = Number.POSITIVE_INFINITY;
    let selected: string | undefined;
    let ambiguous = false;
    for (const candidate of candidates.get(alias) ?? []) {
      const depth = ancestorDistance(candidate.base, location);
      if (depth === undefined || depth > distance) continue;
      if (depth < distance) {
        distance = depth;
        selected = candidate.to;
        ambiguous = false;
      } else if (selected !== candidate.to) {
        const left = nodes.get(selected ?? "");
        const right = nodes.get(candidate.to);
        if (left?.name !== right?.name || left?.version !== right?.version) {
          ambiguous = true;
        }
      }
    }
    return ambiguous ? undefined : selected;
  };

  const edges = new Map<string, DependencyEdge>();
  for (const [from, consumer] of consumers) {
    if (legacy && from === ".") continue;
    for (const category of categories) {
      const field =
        legacy && category === "dependencies" ? "requires" : category;
      const declarations = optionalObject(
        consumer.entry[field],
        `${consumer.field}.${field}`,
      );
      for (const [alias, specifier] of Object.entries(declarations)) {
        const declaration = `${consumer.field}.${field}.${alias}`;
        if (typeof specifier !== "string") {
          throw new Error(`${declaration} must be a string.`);
        }
        if (!/^(?:@[^/@:\s]+\/)?[^/@:\s]+$/.test(alias)) {
          throw new Error(`${declaration} is not a valid dependency name.`);
        }
        const to = resolve(consumer.location, alias);
        if (!to) continue;
        const key = JSON.stringify([from, alias, to]);
        const existing = edges.get(key);
        edges.set(key, {
          from,
          to,
          alias,
          categories: categories.filter(
            (item) => item === category || existing?.categories.includes(item),
          ),
        });
      }
    }
  }
  return {
    nodes: [...nodes.values()].sort((a, b) => compare(a.id, b.id)),
    edges: [...edges.values()].sort(
      (a, b) =>
        compare(a.from, b.from) ||
        compare(a.alias, b.alias) ||
        compare(a.to, b.to),
    ),
    projects: [...projectPaths].sort(compare).map((id) => ({ id, node: id })),
  };
}
