import type {
  DependencyEdge,
  DependencyGraph,
  DependencyScope,
  DependencyUsage,
  ResolvedNode,
} from "./model.js";

export const compareText = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

export function mergeScopes(
  scopes: readonly DependencyScope[],
): DependencyScope {
  const direct = scopes.some((scope) => scope === "direct" || scope === "both");
  const transitive = scopes.some(
    (scope) => scope === "transitive" || scope === "both",
  );
  return direct
    ? transitive
      ? "both"
      : "direct"
    : transitive
      ? "transitive"
      : "unknown";
}

export const edgeIdentity = (edge: DependencyEdge): string =>
  JSON.stringify([edge.from, edge.alias, edge.to]);

export const nodeLabel = (node: ResolvedNode): string =>
  node.label ?? `${node.name}@${node.version}`;

export interface GraphIndex {
  readonly nodes: ReadonlyMap<string, ResolvedNode>;
  readonly outgoing: ReadonlyMap<string, ReadonlyMap<string, DependencyEdge>>;
  readonly projects: ReadonlyMap<string, string>;
  readonly projectNames: ReadonlyMap<string, string>;
  readonly usages: ReadonlyMap<string, DependencyUsage>;
  readonly reachable: ReadonlySet<string>;
}

/** Index only actual declared edges; an installation path never implies directness. */
export function indexGraph(
  graph: DependencyGraph | undefined,
  workspace?: string,
): GraphIndex {
  const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const projects = new Map(
    (graph?.projects ?? [])
      .filter(({ id }) => workspace === undefined || id === workspace)
      .map(({ id, node }) => [id, node]),
  );
  const projectNames = new Map(
    (graph?.projects ?? []).map(({ id, node }) => [node, id]),
  );
  const edges = (graph?.edges ?? []).filter(
    (edge) => nodes.has(edge.from) && nodes.has(edge.to),
  );
  const outgoing = new Map<string, Map<string, DependencyEdge>>();
  const conflicts = new Set<string>();
  for (const edge of edges) {
    const map = outgoing.get(edge.from) ?? new Map<string, DependencyEdge>();
    const previous = map.get(edge.alias);
    if (previous && previous.to !== edge.to)
      conflicts.add(JSON.stringify([edge.from, edge.alias]));
    map.set(edge.alias, edge);
    outgoing.set(edge.from, map);
  }
  // Typed API callers may supply conflicting graph data. It cannot establish a pairing.
  for (const [from, map] of outgoing) {
    for (const alias of map.keys()) {
      if (conflicts.has(JSON.stringify([from, alias]))) map.delete(alias);
    }
  }
  const reach = new Map<string, Map<string, DependencyScope>>();
  const reachable = new Set<string>();
  for (const [project, start] of projects) {
    const visited = new Set<string>();
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i];
      if (from === undefined || visited.has(from)) continue;
      visited.add(from);
      reachable.add(from);
      for (const edge of outgoing.get(from)?.values() ?? []) {
        const scopes =
          reach.get(edgeIdentity(edge)) ?? new Map<string, DependencyScope>();
        scopes.set(project, from === start ? "direct" : "transitive");
        reach.set(edgeIdentity(edge), scopes);
        queue.push(edge.to);
      }
    }
  }
  const usages = new Map<string, DependencyUsage>();
  for (const edge of edges) {
    const consumer = nodes.get(edge.from);
    if (!consumer) continue;
    const id = edgeIdentity(edge);
    const scopes = reach.get(id) ?? new Map<string, DependencyScope>();
    usages.set(id, {
      id,
      consumerId: edge.from,
      consumer: projectNames.get(edge.from) ?? nodeLabel(consumer),
      alias: edge.alias,
      targetId: edge.to,
      scope: mergeScopes([...scopes.values()]),
      projects: [...scopes.keys()].sort(compareText),
    });
  }
  return { nodes, outgoing, projects, projectNames, usages, reachable };
}

export function edgeUsage(
  index: GraphIndex,
  edge: DependencyEdge,
  project?: string,
): DependencyUsage | null {
  const usage = index.usages.get(edgeIdentity(edge));
  if (!usage) return null;
  if (project === undefined) return usage;
  return {
    ...usage,
    projects: [project],
    scope: edge.from === index.projects.get(project) ? "direct" : "transitive",
  };
}

export function edgeContext(
  index: GraphIndex,
  edge: DependencyEdge,
): string | undefined {
  const target = index.nodes.get(edge.to);
  const consumer = index.nodes.get(edge.from);
  if (!target || !consumer) return undefined;
  const project = index.projectNames.get(edge.from);
  if (project === ".")
    return edge.alias === target.name
      ? undefined
      : `${edge.alias} → ${target.name}`;
  const alias =
    edge.alias === target.name ? edge.alias : `${edge.alias} → ${target.name}`;
  return `${project ?? nodeLabel(consumer)} → ${alias}`;
}
