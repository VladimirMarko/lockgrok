import { compareBuild, parse } from "semver";
import { classifyChange } from "./classifyChange.js";
import {
  compareText,
  edgeContext,
  edgeUsage,
  indexGraph,
  mergeScopes,
} from "./graphIndex.js";
import type { GraphIndex } from "./graphIndex.js";
import type {
  ChangeReference,
  ChangeSummary,
  DependencyReference,
  DependencyScope,
  DependencyUsage,
  DiffOptions,
  DiffReport,
  DiffRow,
  LockedPackage,
  Lockfile,
  PackageDetail,
  ReportedChange,
  ScopeFilter,
  VersionDetail,
} from "./model.js";

type Inventory = Map<string, Map<string, string>>;

/** Ignore equivalent spellings such as v1.0.0, but retain build metadata. */
const versionIdentity = (version: string): string => {
  const parsed = parse(version);
  if (!parsed) return version;
  return `${parsed.version}${parsed.build.length ? `+${parsed.build.join(".")}` : ""}`;
};

function compareVersions(a: string, b: string): number {
  const oldVersion = parse(a);
  const newVersion = parse(b);
  if (oldVersion && newVersion)
    return compareBuild(oldVersion, newVersion) || compareText(a, b);
  // A fixed partition avoids non-transitive comparisons between semantic/opaque versions.
  if (oldVersion) return -1;
  if (newVersion) return 1;
  return compareText(a, b);
}

const compareNullableVersions = (a: string | null, b: string | null): number =>
  a === null ? (b === null ? 0 : -1) : b === null ? 1 : compareVersions(a, b);
const packageIdentity = ({ name, version }: LockedPackage): string =>
  JSON.stringify([name, versionIdentity(version)]);
const contextProperty = (
  context: string | undefined,
): { readonly context?: string } => (context === undefined ? {} : { context });

function inventory(packages: readonly LockedPackage[]): Inventory {
  const result: Inventory = new Map();
  for (const { name, version } of packages) {
    const versions = result.get(name) ?? new Map<string, string>();
    const identity = versionIdentity(version);
    const previous = versions.get(identity);
    if (previous === undefined || version < previous)
      versions.set(identity, version);
    result.set(name, versions);
  }
  return result;
}

interface Snapshot {
  readonly graph: GraphIndex;
  readonly inventory: Inventory;
  readonly usages: ReadonlyMap<string, readonly DependencyUsage[]>;
}

function snapshot(lockfile: Lockfile, workspace?: string): Snapshot {
  const graph = indexGraph(lockfile.graph, workspace);
  const usages = new Map<string, DependencyUsage[]>();
  for (const usage of graph.usages.values()) {
    if (workspace !== undefined && !usage.projects.includes(workspace))
      continue;
    const target = graph.nodes.get(usage.targetId);
    if (!target) continue;
    const identity = packageIdentity(target);
    const references = usages.get(identity) ?? [];
    references.push(usage);
    usages.set(identity, references);
  }
  if (!lockfile.graph && workspace === undefined) {
    for (const reference of indexReferences(
      lockfile.references ?? [],
    ).values()) {
      if (!reference) continue;
      const identity = packageIdentity(reference);
      const references = usages.get(identity) ?? [];
      references.push(installationUsage(reference));
      usages.set(identity, references);
    }
  }
  for (const references of usages.values())
    references.sort(
      (a, b) => compareText(a.consumer, b.consumer) || compareText(a.id, b.id),
    );
  // Only reached dependency targets belong to a workspace's inventory. Its
  // project node alone must never pull in unrelated installed name/version twins.
  const packages =
    workspace === undefined
      ? lockfile.packages
      : lockfile.packages.filter((pkg) => usages.has(packageIdentity(pkg)));
  return { graph, inventory: inventory(packages), usages };
}

interface Matches {
  readonly changes: ReportedChange[];
  readonly consumedBefore: Set<string>;
  readonly consumedAfter: Set<string>;
}

function recordPair(
  matches: Matches,
  before: LockedPackage,
  after: LockedPackage,
  beforeContext: string | undefined,
  afterContext: string | undefined,
  reference: ChangeReference,
  match: ReportedChange["match"],
): void {
  const scope = mergeScopes([
    reference.before?.scope ?? "unknown",
    reference.after?.scope ?? "unknown",
  ]);
  if (before.name === after.name) {
    const change = classifyChange(before.version, after.version);
    if (change.direction === "unchanged") return;
    matches.changes.push({
      row: {
        package: before.name,
        before: before.version,
        after: after.version,
        ...change,
        ...contextProperty(afterContext ?? beforeContext),
      },
      match,
      scope,
      references: [reference],
    });
  } else {
    matches.changes.push(
      {
        row: {
          package: before.name,
          before: before.version,
          after: null,
          direction: "remove",
          step: null,
          ...contextProperty(beforeContext),
        },
        match,
        scope: reference.before?.scope ?? "unknown",
        references: [{ before: reference.before, after: null }],
      },
      {
        row: {
          package: after.name,
          before: null,
          after: after.version,
          direction: "add",
          step: null,
          ...contextProperty(afterContext),
        },
        match,
        scope: reference.after?.scope ?? "unknown",
        references: [{ before: null, after: reference.after }],
      },
    );
  }
  matches.consumedBefore.add(packageIdentity(before));
  matches.consumedAfter.add(packageIdentity(after));
}

/** Pair declared consumers recursively, retaining full peer/location IDs within each snapshot. */
function graphChanges(
  before: Snapshot,
  after: Snapshot,
  matches: Matches,
  workspace?: string,
): void {
  const oldGraph = before.graph;
  const newGraph = after.graph;
  const queue: { before: string; after: string; project?: string }[] = [];
  for (const [project, oldNode] of oldGraph.projects) {
    const newNode = newGraph.projects.get(project);
    if (newNode !== undefined)
      queue.push({ before: oldNode, after: newNode, project });
  }
  const visited = new Set<string>();
  const pairedBefore = new Set<string>();
  const pairedAfter = new Set<string>();
  let position = 0;
  function traverse(): void {
    for (; position < queue.length; position++) {
      const pair = queue[position];
      if (!pair) continue;
      const key = JSON.stringify([
        pair.before,
        pair.after,
        pair.project ?? null,
      ]);
      if (visited.has(key)) continue;
      visited.add(key);
      pairedBefore.add(pair.before);
      pairedAfter.add(pair.after);
      for (const [alias, oldEdge] of oldGraph.outgoing.get(pair.before) ?? []) {
        const newEdge = newGraph.outgoing.get(pair.after)?.get(alias);
        if (!newEdge) continue;
        const oldTarget = oldGraph.nodes.get(oldEdge.to);
        const newTarget = newGraph.nodes.get(newEdge.to);
        if (!oldTarget || !newTarget) continue;
        recordPair(
          matches,
          oldTarget,
          newTarget,
          edgeContext(oldGraph, oldEdge),
          edgeContext(newGraph, newEdge),
          {
            before: edgeUsage(oldGraph, oldEdge, pair.project),
            after: edgeUsage(newGraph, newEdge, pair.project),
          },
          "dependency",
        );
        if (oldTarget.name === newTarget.name)
          queue.push({
            before: oldTarget.id,
            after: newTarget.id,
            ...(pair.project === undefined ? {} : { project: pair.project }),
          });
      }
    }
  }
  traverse();
  // Older/incomplete locks may expose package edges without project declarations.
  // Only unchanged, as-yet-unpaired consumers can seed that conservative fallback.
  for (const [id, oldNode] of oldGraph.nodes) {
    const newNode = newGraph.nodes.get(id);
    if (
      !newNode ||
      pairedBefore.has(id) ||
      pairedAfter.has(id) ||
      oldGraph.projectNames.has(id) ||
      newGraph.projectNames.has(id)
    )
      continue;
    if (
      workspace !== undefined &&
      (!oldGraph.reachable.has(id) || !newGraph.reachable.has(id))
    )
      continue;
    if (packageIdentity(oldNode) === packageIdentity(newNode))
      queue.push({ before: id, after: id });
  }
  traverse();
}

/** Conflicting entries for a legacy stable ID cannot establish a trustworthy pairing. */
function indexReferences(
  references: readonly DependencyReference[],
): ReadonlyMap<string, DependencyReference | null> {
  const result = new Map<string, DependencyReference | null>();
  for (const reference of references) {
    const previous = result.get(reference.id);
    if (previous === null) continue;
    if (previous === undefined) result.set(reference.id, reference);
    else if (
      packageIdentity(previous) !== packageIdentity(reference) ||
      previous.context !== reference.context
    )
      result.set(reference.id, null);
    else if (reference.version < previous.version)
      result.set(reference.id, reference);
  }
  return result;
}

function installationUsage(reference: DependencyReference): DependencyUsage {
  return {
    id: reference.id,
    consumerId: reference.id,
    consumer: reference.context ?? reference.id,
    alias: reference.name,
    targetId: reference.id,
    scope: "unknown",
    projects: [],
  };
}

function legacyChanges(
  before: Lockfile,
  after: Lockfile,
  matches: Matches,
): void {
  const oldReferences = indexReferences(before.references ?? []);
  const newReferences = indexReferences(after.references ?? []);
  for (const [id, oldReference] of oldReferences) {
    const newReference = newReferences.get(id);
    if (!oldReference || !newReference) continue;
    recordPair(
      matches,
      oldReference,
      newReference,
      oldReference.context,
      newReference.context,
      {
        before: installationUsage(oldReference),
        after: installationUsage(newReference),
      },
      "installation",
    );
  }
}

function versionScope(
  snapshot: Snapshot,
  name: string,
  version: string | null,
): DependencyScope {
  return version === null
    ? "unknown"
    : mergeScopes(
        (snapshot.usages.get(packageIdentity({ name, version })) ?? []).map(
          ({ scope }) => scope,
        ),
      );
}

function inventoryChanges(
  before: Snapshot,
  after: Snapshot,
  matches: Matches,
): void {
  const names = new Set([
    ...before.inventory.keys(),
    ...after.inventory.keys(),
  ]);
  const push = (row: DiffRow): void => {
    matches.changes.push({
      row,
      match: "inventory",
      references: [],
      scope: mergeScopes([
        versionScope(before, row.package, row.before),
        versionScope(after, row.package, row.after),
      ]),
    });
  };
  for (const name of names) {
    const oldVersions = before.inventory.get(name) ?? new Map<string, string>();
    const newVersions = after.inventory.get(name) ?? new Map<string, string>();
    const removed = [...oldVersions]
      .filter(
        ([id, version]) =>
          !newVersions.has(id) &&
          !matches.consumedBefore.has(packageIdentity({ name, version })),
      )
      .map(([, version]) => version);
    const added = [...newVersions]
      .filter(
        ([id, version]) =>
          !oldVersions.has(id) &&
          !matches.consumedAfter.has(packageIdentity({ name, version })),
      )
      .map(([, version]) => version);
    const oldVersion = removed.length === 1 ? removed[0] : undefined;
    const newVersion = added.length === 1 ? added[0] : undefined;
    if (oldVersion !== undefined && newVersion !== undefined) {
      const change = classifyChange(oldVersion, newVersion);
      if (change.direction !== "unchanged")
        push({
          package: name,
          before: oldVersion,
          after: newVersion,
          ...change,
        });
    } else {
      for (const version of removed)
        push({
          package: name,
          before: version,
          after: null,
          direction: "remove",
          step: null,
        });
      for (const version of added)
        push({
          package: name,
          before: null,
          after: version,
          direction: "add",
          step: null,
        });
    }
  }
}

function mergeUsage(
  a: DependencyUsage | null,
  b: DependencyUsage | null,
): DependencyUsage | null {
  if (!a || !b) return a ?? b;
  return {
    ...a,
    scope: mergeScopes([a.scope, b.scope]),
    projects: [...new Set([...a.projects, ...b.projects])].sort(compareText),
  };
}

function mergeReferences(
  references: readonly ChangeReference[],
): readonly ChangeReference[] {
  const result = new Map<string, ChangeReference>();
  for (const reference of references) {
    const key = JSON.stringify([
      reference.before?.id ?? null,
      reference.after?.id ?? null,
    ]);
    const previous = result.get(key);
    result.set(
      key,
      previous
        ? {
            before: mergeUsage(previous.before, reference.before),
            after: mergeUsage(previous.after, reference.after),
          }
        : reference,
    );
  }
  return [...result]
    .sort(([a], [b]) => compareText(a, b))
    .map(([, reference]) => reference);
}

function uniqueChanges(
  changes: readonly ReportedChange[],
): readonly ReportedChange[] {
  const result = new Map<string, ReportedChange>();
  for (const change of changes) {
    const { row } = change;
    const key = JSON.stringify([
      row.package,
      row.before,
      row.after,
      row.direction,
      row.step,
      row.context ?? null,
      change.match,
    ]);
    const previous = result.get(key);
    result.set(
      key,
      previous
        ? {
            ...previous,
            scope: mergeScopes([previous.scope, change.scope]),
            references: mergeReferences([
              ...previous.references,
              ...change.references,
            ]),
          }
        : change,
    );
  }
  return [...result.values()].sort(
    ({ row: a }, { row: b }) =>
      compareText(a.package, b.package) ||
      compareNullableVersions(a.before, b.before) ||
      compareNullableVersions(a.after, b.after) ||
      compareText(a.context ?? "", b.context ?? "") ||
      compareText(a.direction, b.direction),
  );
}

function summarize(changes: readonly ReportedChange[]): ChangeSummary {
  const counts = { upgrade: 0, downgrade: 0, add: 0, remove: 0, changed: 0 };
  for (const { row } of changes) counts[row.direction]++;
  return {
    packages: new Set(changes.map(({ row }) => row.package)).size,
    changes: changes.length,
    ...counts,
  };
}

function matchesScope(scope: DependencyScope, filter: ScopeFilter): boolean {
  return (
    filter === "all" ||
    scope === filter ||
    (scope === "both" && (filter === "direct" || filter === "transitive"))
  );
}

function versions(snapshot: Snapshot, name: string): readonly VersionDetail[] {
  return [...(snapshot.inventory.get(name)?.values() ?? [])]
    .sort(compareVersions)
    .map((version) => {
      const references =
        snapshot.usages.get(packageIdentity({ name, version })) ?? [];
      return {
        version,
        scope: mergeScopes(references.map(({ scope }) => scope)),
        references,
      };
    });
}

/** Compare consumer relationships first; expose conservative inventory inference explicitly. */
export function createDiffReport(
  before: Lockfile,
  after: Lockfile,
  options: DiffOptions = {},
): DiffReport {
  const oldSnapshot = snapshot(before, options.workspace);
  const newSnapshot = snapshot(after, options.workspace);
  const matches: Matches = {
    changes: [],
    consumedBefore: new Set(),
    consumedAfter: new Set(),
  };
  if (before.manager === after.manager) {
    if (before.graph && after.graph)
      graphChanges(oldSnapshot, newSnapshot, matches, options.workspace);
    else if (!before.graph && !after.graph && options.workspace === undefined)
      legacyChanges(before, after, matches);
  }
  inventoryChanges(oldSnapshot, newSnapshot, matches);
  const all = uniqueChanges(matches.changes);
  const selectedNames = options.packages?.length
    ? new Set(options.packages)
    : undefined;
  const changes = all.filter(
    ({ row, scope }) =>
      (!selectedNames || selectedNames.has(row.package)) &&
      matchesScope(scope, options.scope ?? "all"),
  );
  const names = selectedNames ?? new Set(changes.map(({ row }) => row.package));
  const packages: PackageDetail[] = [...names]
    .filter(
      (name) =>
        oldSnapshot.inventory.has(name) || newSnapshot.inventory.has(name),
    )
    .sort(compareText)
    .map((name) => ({
      package: name,
      before: versions(oldSnapshot, name),
      after: versions(newSnapshot, name),
      retained: [...(oldSnapshot.inventory.get(name) ?? [])]
        .filter(([id]) => newSnapshot.inventory.get(name)?.has(id))
        .map(([, version]) => version)
        .sort(compareVersions),
      changes: changes.filter(({ row }) => row.package === name),
    }));
  return {
    changes,
    packages,
    summary: summarize(changes),
    total: summarize(all),
    ...(options.workspace === undefined
      ? {}
      : { workspace: options.workspace }),
  };
}

/** Backward-compatible rows; report metadata and scope remain opt-in. */
export function diffLockfiles(
  before: Lockfile,
  after: Lockfile,
): readonly DiffRow[] {
  return createDiffReport(before, after).changes.map(({ row }) => row);
}
