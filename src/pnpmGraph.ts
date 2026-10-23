import { posix } from "node:path";
import { valid } from "semver";
import type {
  DependencyCategory,
  DependencyEdge,
  DependencyGraph,
  LockedPackage,
  ProjectRoot,
  ResolvedNode,
} from "./model.js";

const importerFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
] as const;
const packageFields = ["dependencies", "optionalDependencies"] as const;

const compareText = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function object(value: unknown, location: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${location} must be an object.`);
  return value;
}

function optionalObject(
  value: unknown,
  location: string,
): Record<string, unknown> {
  return value === undefined ? {} : object(value, location);
}

function text(value: unknown, location: string): string {
  if (typeof value !== "string" || !value)
    throw new Error(`${location} must be a non-empty string.`);
  return value;
}

function optionalText(value: unknown, location: string): string | undefined {
  return value === undefined ? undefined : text(value, location);
}

const normalizeKey = (key: string): string =>
  key.startsWith("/") ? key.slice(1) : key;

const normalizePath = (path: string): string =>
  posix.normalize(path.replaceAll("\\", "/")).replace(/\/$/, "") || ".";

/** Keep the peer suffix from the chosen reference, separate from its version. */
function fullVersion(ref: string, resolved: LockedPackage): string {
  if (!valid(resolved.version)) return resolved.version;
  const key = normalizeKey(ref.startsWith("npm:") ? ref.slice(4) : ref);
  for (const separator of ["@", "/"]) {
    const prefix = `${resolved.name}${separator}`;
    const offset = key.indexOf(prefix);
    if (offset >= 0 && (offset === 0 || key[offset - 1] === "/"))
      return key.slice(offset + prefix.length);
  }
  if (
    key === resolved.version ||
    key.startsWith(`${resolved.version}(`) ||
    key.startsWith(`${resolved.version}_`)
  )
    return key;
  return resolved.version;
}

interface Importer {
  readonly path: string;
  readonly value: Record<string, unknown>;
}

interface MutableEdge {
  readonly from: string;
  readonly to: string;
  readonly alias: string;
  readonly categories: Set<DependencyCategory>;
}

/** Preserve pnpm's resolved snapshot identities without interpreting peer suffixes as versions. */
export function buildPnpmGraph(
  root: Record<string, unknown>,
  version: string,
  resolve: (alias: string, ref: string) => LockedPackage,
): DependencyGraph {
  const packages = optionalObject(root.packages, "packages");
  const snapshots = version.startsWith("9")
    ? optionalObject(root.snapshots, "snapshots")
    : packages;
  const nodes = new Map<string, ResolvedNode>();
  const exact = new Map<string, string>();
  const alternatives = new Map<string, Set<string>>();
  const edges = new Map<string, MutableEdge>();
  const importers = new Map<string, Importer>();
  const projects: ProjectRoot[] = [];
  const expandedLinks = new Set<string>();

  const addNode = (node: ResolvedNode): void => {
    const previous = nodes.get(node.id);
    if (
      previous &&
      (previous.name !== node.name || previous.version !== node.version)
    )
      throw new Error(`Conflicting resolutions for pnpm node ${node.id}.`);
    nodes.set(node.id, node);
  };

  const addAlternative = (key: string, id: string): void => {
    const matches = alternatives.get(key) ?? new Set<string>();
    matches.add(id);
    alternatives.set(key, matches);
  };

  const addInstalled = (key: string, raw: unknown, location: string): void => {
    object(raw, location);
    const canonical = resolve("", key);
    const normalized = normalizeKey(key);
    const id = `pnpm:${normalized}`;
    addNode({ id, ...canonical, label: normalized });
    exact.set(normalized, id);
    const selectedVersion = fullVersion(key, canonical);
    addAlternative(`${canonical.name}@${selectedVersion}`, id);
    addAlternative(`${canonical.name}/${selectedVersion}`, id);
  };

  for (const [key, raw] of Object.entries(packages))
    addInstalled(key, raw, `packages[${key}]`);
  if (snapshots !== packages)
    for (const [key, raw] of Object.entries(snapshots))
      addInstalled(key, raw, `snapshots[${key}]`);

  const rawImporters =
    root.importers === undefined
      ? { ".": root }
      : object(root.importers, "importers");
  for (const [rawPath, raw] of Object.entries(rawImporters)) {
    const path = normalizePath(rawPath);
    if (importers.has(path))
      throw new Error(`Duplicate normalized pnpm importer ${path}.`);
    const value = object(raw, `importers[${rawPath}]`);
    const id = `project:${path}`;
    addNode({
      id,
      name: optionalText(value.name, `importers[${rawPath}].name`) ?? path,
      version:
        optionalText(value.version, `importers[${rawPath}].version`) ??
        "workspace",
      label: path,
      location: path,
    });
    importers.set(path, { path, value });
    projects.push({ id: path, node: id });
  }

  const findInstalled = (
    alias: string,
    ref: string,
    canonical: LockedPackage,
  ): string | undefined => {
    const key = normalizeKey(ref.startsWith("npm:") ? ref.slice(4) : ref);
    const selectedVersion = fullVersion(ref, canonical);
    const candidates = [
      key,
      `${alias}@${key}`,
      `${alias}/${key}`,
      `${canonical.name}@${selectedVersion}`,
      `${canonical.name}/${selectedVersion}`,
    ];
    for (const candidate of candidates) {
      const id = exact.get(candidate);
      if (id) return id;
    }
    for (const candidate of candidates) {
      const matches = alternatives.get(candidate);
      if (matches?.size === 1) return matches.values().next().value;
    }
    return undefined;
  };

  const addEdge = (
    from: string,
    to: string,
    alias: string,
    categories: readonly DependencyCategory[],
  ): void => {
    const key = JSON.stringify([from, alias]);
    const previous = edges.get(key);
    if (previous && previous.to !== to)
      throw new Error(`Conflicting resolutions for ${from} → ${alias}.`);
    const entry = previous ?? {
      from,
      to,
      alias,
      categories: new Set<DependencyCategory>(),
    };
    for (const category of categories) entry.categories.add(category);
    edges.set(key, entry);
  };

  const readDependencies = (
    from: string,
    value: Record<string, unknown>,
    location: string,
    importerPath: string | undefined,
    peers: ReadonlySet<string>,
  ): void => {
    for (const field of importerPath === undefined
      ? packageFields
      : importerFields) {
      for (const [alias, raw] of Object.entries(
        optionalObject(value[field], `${location}.${field}`),
      )) {
        const refLocation = `${location}.${field}.${alias}`;
        const ref = text(
          importerPath !== undefined && typeof raw !== "string"
            ? object(raw, refLocation).version
            : raw,
          refLocation,
        );
        const canonical = resolve(alias, ref);
        const linkRef = canonical.version.startsWith("link:")
          ? canonical.version.slice(5).replaceAll("\\", "/")
          : undefined;
        const linkPath =
          importerPath !== undefined &&
          linkRef &&
          !posix.isAbsolute(linkRef) &&
          !/^[A-Za-z]:\//.test(linkRef)
            ? normalizePath(posix.join(importerPath, linkRef))
            : undefined;
        const linked =
          linkPath === undefined ? undefined : importers.get(linkPath);
        let target = findInstalled(alias, ref, canonical);
        if (linked) {
          // Different relative link spellings retain their source identity. Their
          // dependencies are expanded directly, without synthetic package edges.
          target = `pnpm-link:${JSON.stringify([importerPath, alias, ref])}`;
          addNode({
            id: target,
            ...canonical,
            label: `${canonical.name}@${canonical.version}`,
            location: linked.path,
          });
          if (!expandedLinks.has(target)) {
            expandedLinks.add(target);
            readDependencies(
              target,
              linked.value,
              `importers[${linked.path}]`,
              linked.path,
              new Set(),
            );
          }
        } else if (!target) {
          if (field === "optionalDependencies") continue;
          const selectedVersion = fullVersion(ref, canonical);
          target = `pnpm:${canonical.name}@${selectedVersion}`;
          addNode({
            id: target,
            ...canonical,
            label: `${canonical.name}@${selectedVersion}`,
          });
        }
        addEdge(
          from,
          target,
          alias,
          peers.has(alias) ? [field, "peerDependencies"] : [field],
        );
      }
    }
  };

  for (const importer of importers.values())
    readDependencies(
      `project:${importer.path}`,
      importer.value,
      `importers[${importer.path}]`,
      importer.path,
      new Set(),
    );

  for (const [key, raw] of Object.entries(snapshots)) {
    const location = `${version.startsWith("9") ? "snapshots" : "packages"}[${key}]`;
    const value = object(raw, location);
    const id = `pnpm:${normalizeKey(key)}`;
    const parent = nodes.get(id);
    if (!parent) throw new Error(`Missing pnpm snapshot node ${key}.`);
    const selectedVersion = fullVersion(key, parent);
    const suffix = selectedVersion.slice(parent.version.length);
    const baseKey =
      valid(parent.version) &&
      /^[(_]/.test(suffix) &&
      key.endsWith(selectedVersion)
        ? key.slice(0, -suffix.length)
        : key;
    const metadata = optionalObject(packages[baseKey], location);
    const peers = new Set<string>();
    for (const source of [metadata, value])
      for (const [alias, range] of Object.entries(
        optionalObject(source.peerDependencies, `${location}.peerDependencies`),
      )) {
        if (typeof range !== "string")
          throw new Error(
            `${location}.peerDependencies.${alias} must be a string.`,
          );
        peers.add(alias);
      }
    // peerDependencies holds ranges, not installed targets. Only peers also
    // present among resolved dependency edges can become graph edges.
    readDependencies(id, value, location, undefined, peers);
  }

  const resultEdges: DependencyEdge[] = [...edges.values()].map((entry) => ({
    ...entry,
    categories: [...entry.categories].sort(compareText),
  }));
  return {
    nodes: [...nodes.values()].sort((a, b) => compareText(a.id, b.id)),
    edges: resultEdges.sort(
      (a, b) =>
        compareText(a.from, b.from) ||
        compareText(a.alias, b.alias) ||
        compareText(a.to, b.to),
    ),
    projects: projects.sort((a, b) => compareText(a.id, b.id)),
  };
}
