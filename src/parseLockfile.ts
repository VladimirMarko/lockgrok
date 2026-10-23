import { Effect, Schema } from "effect";
import { valid } from "semver";
import { parseAllDocuments } from "yaml";
import { LockfileError } from "./errors.js";
import type {
  DependencyGraph,
  DependencyReference,
  LockedPackage,
  Lockfile,
  PackageManager,
} from "./model.js";
import { buildNpmGraph } from "./npmGraph.js";
import { buildPnpmGraph } from "./pnpmGraph.js";

const ObjectSchema = Schema.Record(Schema.String, Schema.Unknown);
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
] as const;

interface ParsedInventory {
  readonly packages: LockedPackage[];
  readonly references: DependencyReference[];
  readonly graph?: DependencyGraph;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`);
  return value;
}

function optionalObject(
  value: unknown,
  field: string,
): Record<string, unknown> {
  return value === undefined ? {} : object(value, field);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function packageName(name: string): boolean {
  return /^(?:@[^/@:\s]+\/)?[^/@:\s]+$/.test(name);
}

/** Peer environments are installation context, not SemVer prerelease/build suffixes. */
function withoutPeers(version: string): string {
  const suffix = version.search(/[(_]/);
  if (suffix < 0) return version;
  const prefix = version.slice(0, suffix);
  return isVersion(prefix) ? prefix : version;
}

function isVersion(value: string): boolean {
  return valid(value) !== null;
}

function aliasVersion(name: string, version: string): LockedPackage {
  if (!version.startsWith("npm:")) return { name, version };
  const target = version.slice(4);
  const separator = target.lastIndexOf("@");
  if (separator <= 0 || !packageName(target.slice(0, separator))) {
    throw new Error(`Invalid npm alias version for ${name}: ${version}`);
  }
  const resolved = target.slice(separator + 1);
  if (!resolved) throw new Error(`Missing npm alias version for ${name}.`);
  return { name: target.slice(0, separator), version: resolved };
}

function npmReference(
  version: string | undefined,
  resolved: string | undefined,
  declaredReferences: ReadonlySet<string>,
): string | undefined {
  // A Git commit or explicitly requested archive is the resolved identity;
  // its package.json version alone may stay unchanged across source updates.
  if (
    resolved &&
    (/^(?:git(?:\+[^:]+)?|github|gitlab|bitbucket):/.test(resolved) ||
      declaredReferences.has(resolved))
  )
    return resolved;
  return version ?? resolved;
}

function declaredReferences(
  entries: Record<string, unknown>,
): ReadonlySet<string> {
  const references = new Set<string>();
  for (const [path, raw] of Object.entries(entries)) {
    const entry = object(raw, `packages[${path}]`);
    for (const field of dependencyFields) {
      const location = `packages[${path}].${field}`;
      const dependencies = optionalObject(entry[field], location);
      for (const [name, specifier] of Object.entries(dependencies)) {
        // An empty declared range is npm's spelling for "*"; resolved versions
        // remain non-empty, but declaration validation must accept this range.
        if (typeof specifier !== "string") {
          throw new Error(`${location}.${name} must be a string.`);
        }
        if (/^(?:https?|file):/.test(specifier)) {
          references.add(specifier);
        }
      }
    }
  }
  return references;
}

function npmInventory(
  root: Record<string, unknown>,
  version: string,
): ParsedInventory {
  const inventory: ParsedInventory = { packages: [], references: [] };
  const add = (path: string, entry: LockedPackage): void => {
    inventory.packages.push(entry);
    inventory.references.push({
      id: path,
      ...entry,
      ...(path === `node_modules/${entry.name}` ? {} : { context: path }),
    });
  };

  if (version === "1") {
    const visit = (
      dependencies: unknown,
      path: string,
      parent: string,
    ): void => {
      for (const [name, raw] of Object.entries(
        optionalObject(dependencies, path),
      )) {
        const entry = object(raw, `${path}.${name}`);
        const resolved = npmReference(
          optionalString(entry.version, `${path}.${name}.version`),
          optionalString(entry.resolved, `${path}.${name}.resolved`),
          new Set(),
        );
        if (!resolved)
          throw new Error(`Missing version or resolution for ${name}.`);
        const installedPath = `${parent ? `${parent}/` : ""}node_modules/${name}`;
        add(installedPath, aliasVersion(name, resolved));
        visit(
          entry.dependencies,
          `${path}.${name}.dependencies`,
          installedPath,
        );
      }
    };
    visit(root.dependencies, "dependencies", "");
    return {
      ...inventory,
      graph: buildNpmGraph(root, version, inventory.references),
    };
  }

  const entries = object(root.packages, "packages");
  const references = declaredReferences(entries);
  for (const [path, raw] of Object.entries(entries)) {
    // Root and workspace manifests are project metadata, not installed dependencies.
    const match = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(path);
    if (!match?.[1]) continue;
    const entry = object(raw, `packages[${path}]`);
    const name =
      optionalString(entry.name, `packages[${path}].name`) ?? match[1];
    const version = optionalString(entry.version, `packages[${path}].version`);
    const resolved = optionalString(
      entry.resolved,
      `packages[${path}].resolved`,
    );
    if (entry.link !== undefined && typeof entry.link !== "boolean") {
      throw new Error(`packages[${path}].link must be a boolean.`);
    }
    if (entry.link) {
      if (!resolved) throw new Error(`Missing link resolution for ${name}.`);
      add(path, {
        name,
        version: resolved.startsWith("link:") ? resolved : `link:${resolved}`,
      });
    } else {
      const reference = npmReference(version, resolved, references);
      if (!reference)
        throw new Error(`Missing version or resolution for ${name}.`);
      add(path, aliasVersion(name, reference));
    }
  }
  return {
    ...inventory,
    graph: buildNpmGraph(root, version, inventory.references),
  };
}

function pnpmPackageId(
  key: string,
  legacy: boolean,
): LockedPackage | undefined {
  let id = key.startsWith("/") ? key.slice(1) : key;
  if (/^[a-z][a-z+.-]*:/i.test(id)) return undefined;
  // Older formats permit a registry host prefix. Scoped names retain their slash.
  const slash = id.indexOf("/");
  if (slash >= 0 && !id.startsWith("@")) {
    const first = id.slice(0, slash);
    const rest = id.slice(slash + 1);
    const isRegistryPath =
      !first.includes("@") &&
      !first.includes(":") &&
      (legacy ? rest.includes("/") : rest.includes("@"));
    if (isRegistryPath) id = rest;
  }
  const separator = legacy
    ? id.lastIndexOf("/")
    : id.indexOf("@", id.startsWith("@") ? 1 : 0);
  if (separator <= 0) return undefined;
  const name = id.slice(0, separator);
  const version = withoutPeers(id.slice(separator + 1));
  if (!packageName(name) || !version) return undefined;
  return { name, version };
}

function pnpmPackage(
  key: string,
  raw: unknown,
  legacy: boolean,
): LockedPackage {
  const entry = object(raw, `packages[${key}]`);
  const parsed = pnpmPackageId(key, legacy);
  const name =
    optionalString(entry.name, `packages[${key}].name`) ?? parsed?.name;
  const metadataVersion = optionalString(
    entry.version,
    `packages[${key}].version`,
  );
  // Source identity must survive a Git/URL update whose package.json version is unchanged.
  const opaqueReference =
    !parsed || (legacy && !isVersion(parsed.version))
      ? key
      : !isVersion(parsed.version)
        ? parsed.version
        : undefined;
  const resolved = opaqueReference ?? metadataVersion ?? parsed?.version;
  if (!name || !resolved)
    throw new Error(`Cannot determine package name and version from ${key}.`);
  return { name, version: withoutPeers(resolved) };
}

function pnpmReference(
  alias: string,
  ref: string,
  legacy: boolean,
  catalog: ReadonlyMap<string, LockedPackage>,
): LockedPackage {
  const candidates = [
    ref,
    `/${ref}`,
    `${alias}@${ref}`,
    `/${alias}@${ref}`,
    `/${alias}/${ref}`,
  ];
  for (const candidate of candidates) {
    const exact = catalog.get(candidate);
    if (exact) return exact;
  }
  // Snapshot and importer references can add peers to an existing package key.
  for (const candidate of candidates) {
    const peerStart = candidate.indexOf("(");
    if (peerStart < 0) continue;
    const base = catalog.get(candidate.slice(0, peerStart));
    if (base) return base;
  }
  const normalized = withoutPeers(ref);
  const parsed = ref.startsWith("npm:")
    ? pnpmPackageId(ref.slice(4), false)
    : pnpmPackageId(ref, legacy);
  const target = isVersion(normalized)
    ? { name: alias, version: normalized }
    : (parsed ?? { name: alias, version: ref });
  return catalog.get(`${target.name}@${target.version}`) ?? target;
}

function dependencyVersion(
  raw: unknown,
  location: string,
  importer: boolean,
): string {
  const ref =
    typeof raw === "string" || !importer
      ? optionalString(raw, location)
      : optionalString(object(raw, location).version, `${location}.version`);
  if (!ref) throw new Error(`Missing resolved version for ${location}.`);
  return ref;
}

function pnpmInventory(
  root: Record<string, unknown>,
  version: string,
): ParsedInventory {
  const inventory: ParsedInventory = { packages: [], references: [] };
  const entries = optionalObject(root.packages, "packages");
  const legacy = version.startsWith("5.");
  const catalog = new Map<string, LockedPackage>();
  for (const [key, raw] of Object.entries(entries)) {
    const entry = pnpmPackage(key, raw, legacy);
    inventory.packages.push(entry);
    catalog.set(key, entry);
    catalog.set(key.startsWith("/") ? key.slice(1) : `/${key}`, entry);
    catalog.set(`${entry.name}@${entry.version}`, entry);
  }

  const addReference = (
    id: string,
    alias: string,
    ref: string,
    context: (entry: LockedPackage) => string | undefined,
  ): void => {
    const entry = pnpmReference(alias, ref, legacy, catalog);
    inventory.packages.push(entry);
    const label = context(entry);
    inventory.references.push({
      id,
      ...entry,
      ...(label ? { context: label } : {}),
    });
  };

  const importers =
    root.importers === undefined
      ? { ".": root }
      : object(root.importers, "importers");
  for (const [path, value] of Object.entries(importers)) {
    const importer = object(value, `importers[${path}]`);
    for (const field of dependencyFields) {
      const refs = optionalObject(
        importer[field],
        `importers[${path}].${field}`,
      );
      for (const [alias, raw] of Object.entries(refs)) {
        const location = `importers[${path}].${field}.${alias}`;
        const ref = dependencyVersion(raw, location, true);
        addReference(`importer:${path}:${alias}`, alias, ref, (entry) => {
          if (path !== ".") return `${path} → ${alias}`;
          return alias === entry.name ? undefined : `${alias} → ${entry.name}`;
        });
      }
    }
  }

  // v9 puts graph edges in snapshots; v5/v6 keep them with the package metadata.
  const parents = version.startsWith("9")
    ? optionalObject(root.snapshots, "snapshots")
    : entries;
  for (const [key, raw] of Object.entries(parents)) {
    const location = `${version.startsWith("9") ? "snapshots" : "packages"}[${key}]`;
    const snapshot = object(raw, location);
    const parent = pnpmReference("", key, legacy, catalog);
    if (!parent.name)
      throw new Error(`Cannot determine snapshot parent name from ${key}.`);
    for (const field of ["dependencies", "optionalDependencies"] as const) {
      for (const [alias, rawRef] of Object.entries(
        optionalObject(snapshot[field], `${location}.${field}`),
      )) {
        const ref = dependencyVersion(
          rawRef,
          `${location}.${field}.${alias}`,
          false,
        );
        addReference(
          `parent:${key}:${alias}`,
          alias,
          ref,
          () => `${parent.name}@${parent.version} → ${alias}`,
        );
      }
    }
  }
  return {
    ...inventory,
    graph: buildPnpmGraph(root, version, (alias, ref) =>
      pnpmReference(alias, ref, legacy, catalog),
    ),
  };
}

function uniqueReferences(
  references: readonly DependencyReference[],
): DependencyReference[] {
  const unique = new Map<string, DependencyReference>();
  for (const entry of references) {
    const previous = unique.get(entry.id);
    if (
      previous &&
      (previous.name !== entry.name || previous.version !== entry.version)
    ) {
      throw new Error(
        `Conflicting resolutions for dependency reference ${entry.id}.`,
      );
    }
    unique.set(entry.id, entry);
  }
  return [...unique.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

function uniqueInventory(packages: readonly LockedPackage[]): LockedPackage[] {
  const unique = new Map<string, LockedPackage>();
  for (const entry of packages)
    unique.set(JSON.stringify([entry.name, entry.version]), entry);
  return [...unique.values()].sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.version < b.version ? -1 : a.version > b.version ? 1 : 0;
  });
}

function errorFrom(source: string, cause: unknown): LockfileError {
  return new LockfileError({
    source,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

/** Parse untrusted lockfile text into an immutable, layout-independent inventory. */
export function parseLockfile(
  content: string,
  source = "lockfile",
  manager?: PackageManager,
): Effect.Effect<Lockfile, LockfileError> {
  return Effect.gen(function* () {
    const text = content.replace(/^\uFEFF/, "").trim();
    const json =
      manager === "npm" || (manager !== "pnpm" && /^[{[]/.test(text));
    const decoded = yield* Effect.try({
      try: (): unknown => {
        if (!text) throw new Error("The lockfile is empty.");
        if (json) {
          try {
            return JSON.parse(text);
          } catch (cause) {
            throw new Error(
              `Invalid JSON lockfile: ${cause instanceof Error ? cause.message : String(cause)}`,
            );
          }
        }
        const documents = parseAllDocuments(text);
        for (const document of documents) {
          if (document.errors.length > 0) {
            throw new Error(
              `Invalid YAML lockfile: ${document.errors.map((error) => error.message).join("; ")}`,
            );
          }
        }
        // pnpm 11+ may prepend a boot/toolchain document; the project is always last.
        return documents.at(-1)?.toJS({ maxAliasCount: 100 });
      },
      catch: (cause) => errorFrom(source, cause),
    });
    const root = yield* Schema.decodeUnknownEffect(ObjectSchema)(decoded).pipe(
      Effect.mapError(
        (cause) =>
          new LockfileError({
            source,
            message: "The lockfile must be an object.",
            cause,
          }),
      ),
    );
    return yield* Effect.try({
      try: (): Lockfile => {
        const rawVersion = root.lockfileVersion;
        if (
          (typeof rawVersion !== "string" && typeof rawVersion !== "number") ||
          rawVersion === ""
        ) {
          throw new Error("Missing or invalid lockfileVersion.");
        }
        const version = String(rawVersion);
        const detected =
          manager ??
          (!json ||
          /^(?:5\.|6(?:\.|$)|9(?:\.|$))/.test(version) ||
          root.importers !== undefined
            ? "pnpm"
            : "npm");
        if (detected === "npm" && !["1", "2", "3"].includes(version)) {
          throw new Error(
            `Unsupported npm lockfileVersion ${version}; supported versions: 1, 2, 3.`,
          );
        }
        if (
          detected === "pnpm" &&
          !/^(?:5\.4|6(?:\.\d+)?|9(?:\.\d+)?)$/.test(version)
        ) {
          throw new Error(
            `Unsupported pnpm lockfileVersion ${version}; supported versions: 5.4, 6.x, 9.x.`,
          );
        }
        const inventory =
          detected === "npm"
            ? npmInventory(root, version)
            : pnpmInventory(root, version);
        return {
          manager: detected,
          lockfileVersion: version,
          packages: uniqueInventory(inventory.packages),
          references: uniqueReferences(inventory.references),
          ...(inventory.graph === undefined ? {} : { graph: inventory.graph }),
        };
      },
      catch: (cause) => errorFrom(source, cause),
    });
  });
}
