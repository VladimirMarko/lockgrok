import assert from "node:assert/strict";
import { test } from "node:test";
import { createDiffReport, diffLockfiles } from "../diffLockfiles.js";
import type {
  DependencyEdge,
  DependencyGraph,
  Lockfile,
  ResolvedNode,
} from "../model.js";

const node = (
  id: string,
  name: string,
  version: string,
  label?: string,
): ResolvedNode => ({
  id,
  name,
  version,
  ...(label === undefined ? {} : { label }),
});
const edge = (from: string, alias: string, to: string): DependencyEdge => ({
  from,
  alias,
  to,
  categories: ["dependencies"],
});
const lock = (
  graph: DependencyGraph,
  manager: "npm" | "pnpm" = "pnpm",
): Lockfile => ({
  manager,
  lockfileVersion: manager === "npm" ? "3" : "9.0",
  graph,
  packages: graph.nodes.filter(
    ({ id }) => !graph.projects.some(({ node }) => node === id),
  ),
});
const root = node("project:.", "root", "workspace", ".");
const projects = [{ id: ".", node: root.id }];
const leaf = (id: string, version: string) => node(id, "leaf", version);

function parentUpdate(after: boolean): Lockfile {
  const a = node(`a@${after ? 2 : 1}`, "a", after ? "2.0.0" : "1.0.0");
  const b = node("b@1", "b", "1.0.0");
  return lock({
    projects,
    nodes: [
      root,
      a,
      b,
      leaf("leaf@1", "1.0.0"),
      ...(after ? [leaf("leaf@2", "2.0.0")] : []),
    ],
    edges: [
      edge(root.id, "a", a.id),
      edge(root.id, "b", b.id),
      edge(a.id, "leaf", after ? "leaf@2" : "leaf@1"),
      edge(b.id, "leaf", "leaf@1"),
    ],
  });
}

test("follows a consumer across its own upgrade while an old child version remains", () => {
  assert.deepEqual(diffLockfiles(parentUpdate(false), parentUpdate(true)), [
    {
      package: "a",
      before: "1.0.0",
      after: "2.0.0",
      direction: "upgrade",
      step: "major",
    },
    {
      package: "leaf",
      before: "1.0.0",
      after: "2.0.0",
      direction: "upgrade",
      step: "major",
      context: "a@2.0.0 → leaf",
    },
  ]);
  const report = createDiffReport(parentUpdate(false), parentUpdate(true));
  assert.deepEqual(report.summary, {
    packages: 2,
    changes: 2,
    upgrade: 2,
    downgrade: 0,
    add: 0,
    remove: 0,
    changed: 0,
  });
  const details = report.packages.find((item) => item.package === "leaf");
  assert.deepEqual(details?.retained, ["1.0.0"]);
  assert.deepEqual(
    details?.after.map(({ version }) => version),
    ["1.0.0", "2.0.0"],
  );
  assert.equal(details?.changes[0]?.match, "dependency");
  assert.equal(details?.changes[0]?.scope, "transitive");
  assert.equal(details?.changes[0]?.references[0]?.before?.consumerId, "a@1");
  assert.equal(details?.changes[0]?.references[0]?.after?.consumerId, "a@2");
});

test("npm hoisting changes are invisible when every declared consumer resolves the same version", () => {
  const graph = (after: boolean): DependencyGraph => ({
    projects,
    nodes: [
      root,
      node("node_modules/a", "a", "1.0.0"),
      node("node_modules/b", "b", "1.0.0"),
      leaf(
        after ? "node_modules/a/node_modules/leaf" : "node_modules/leaf",
        "1.0.0",
      ),
      leaf(
        after ? "node_modules/leaf" : "node_modules/b/node_modules/leaf",
        "2.0.0",
      ),
    ],
    edges: [
      edge(root.id, "a", "node_modules/a"),
      edge(root.id, "b", "node_modules/b"),
      edge(
        "node_modules/a",
        "leaf",
        after ? "node_modules/a/node_modules/leaf" : "node_modules/leaf",
      ),
      edge(
        "node_modules/b",
        "leaf",
        after ? "node_modules/leaf" : "node_modules/b/node_modules/leaf",
      ),
    ],
  });
  const before = {
    ...lock(graph(false), "npm"),
    references: [{ id: "node_modules/leaf", name: "leaf", version: "1.0.0" }],
  };
  const after = {
    ...lock(graph(true), "npm"),
    references: [{ id: "node_modules/leaf", name: "leaf", version: "2.0.0" }],
  };
  assert.deepEqual(diffLockfiles(before, after), []);
});

function peerSwap(after: boolean): Lockfile {
  const web = node("project:web", "web", "workspace", "apps/web");
  const api = node("project:api", "api", "workspace", "apps/api");
  const one = node("host@1(peer@1)", "host", "1.0.0", "host@1.0.0(peer@1.0.0)");
  const two = node("host@1(peer@2)", "host", "1.0.0", "host@1.0.0(peer@2.0.0)");
  return lock({
    projects: [
      { id: "apps/web", node: web.id },
      { id: "apps/api", node: api.id },
    ],
    nodes: [
      web,
      api,
      one,
      two,
      leaf("leaf@1", "1.0.0"),
      leaf("leaf@2", "2.0.0"),
    ],
    edges: [
      edge(web.id, "host", after ? two.id : one.id),
      edge(api.id, "host", after ? one.id : two.id),
      edge(one.id, "leaf", "leaf@1"),
      edge(two.id, "leaf", "leaf@2"),
    ],
  });
}

test("peer selections preserve opposite child changes even when all package versions are retained", () => {
  const before = peerSwap(false);
  const after = peerSwap(true);
  const report = createDiffReport(before, after);
  assert.deepEqual(
    report.changes.map(({ row }) => [row.package, row.direction, row.context]),
    [
      ["leaf", "upgrade", "host@1.0.0(peer@2.0.0) → leaf"],
      ["leaf", "downgrade", "host@1.0.0(peer@1.0.0) → leaf"],
    ],
  );
  assert.equal(report.summary.packages, 1);
  assert.equal(report.summary.changes, 2);
  assert.deepEqual(report.packages[0]?.retained, ["1.0.0", "2.0.0"]);
  assert.deepEqual(report.changes[0]?.references[0]?.after?.projects, [
    "apps/web",
  ]);
  assert.deepEqual(report.changes[1]?.references[0]?.after?.projects, [
    "apps/api",
  ]);
  const web = createDiffReport(before, after, { workspace: "apps/web" });
  assert.equal(web.changes.length, 1);
  assert.equal(web.changes[0]?.row.direction, "upgrade");
  assert.deepEqual(
    web.packages[0]?.before.map(({ version }) => version),
    ["1.0.0"],
  );
  assert.deepEqual(
    web.packages[0]?.after.map(({ version }) => version),
    ["2.0.0"],
  );
  assert.deepEqual(web.packages[0]?.retained, []);
});

test("scope follows selected project roots and can be direct, transitive, both, or unknown", () => {
  const snapshot = (version: string): Lockfile =>
    lock({
      projects,
      nodes: [
        root,
        node("parent", "parent", "1.0.0"),
        leaf(`leaf@${version}`, version),
        node("orphan", "orphan", version),
      ],
      edges: [
        edge(root.id, "parent", "parent"),
        edge(root.id, "leaf", `leaf@${version}`),
        edge("parent", "leaf", `leaf@${version}`),
      ],
    });
  const report = createDiffReport(snapshot("1.0.0"), snapshot("2.0.0"));
  const leafDetails = report.packages.find((item) => item.package === "leaf");
  assert.equal(leafDetails?.before[0]?.scope, "both");
  assert.deepEqual(
    leafDetails?.changes.map(({ scope }) => scope),
    ["direct", "transitive"],
  );
  assert.equal(
    report.packages.find((item) => item.package === "orphan")?.changes[0]
      ?.scope,
    "unknown",
  );
  const direct = createDiffReport(snapshot("1.0.0"), snapshot("2.0.0"), {
    scope: "direct",
  });
  assert.equal(direct.summary.changes, 1);
  assert.equal(direct.total.changes, 3);
  const empty = createDiffReport(snapshot("1.0.0"), snapshot("2.0.0"), {
    packages: ["absent"],
  });
  assert.equal(empty.summary.changes, 0);
  assert.equal(empty.total.changes, 3);
});

test("unknown legacy directness stays unknown and inventory pairing explains its evidence", () => {
  const snapshot = (versions: readonly string[]): Lockfile => ({
    manager: "npm",
    lockfileVersion: "1",
    packages: versions.map((version) => ({ name: "leaf", version })),
  });
  const report = createDiffReport(
    snapshot(["1.0.0", "2.0.0"]),
    snapshot(["1.0.0", "3.0.0"]),
  );
  assert.equal(report.changes[0]?.match, "inventory");
  assert.equal(report.changes[0]?.scope, "unknown");
  assert.deepEqual(report.changes[0]?.references, []);
  assert.deepEqual(report.packages[0]?.retained, ["1.0.0"]);
  const ambiguous = createDiffReport(
    snapshot(["1.0.0", "2.0.0"]),
    snapshot(["3.0.0", "4.0.0"]),
  );
  assert.deepEqual(
    ambiguous.changes.map(({ row }) => row.direction),
    ["add", "add", "remove", "remove"],
  );
  assert.ok(ambiguous.changes.every(({ match }) => match === "inventory"));
});

test("details can inspect an unchanged package and sort complete versions semantically", () => {
  const snapshot: Lockfile = {
    manager: "pnpm",
    lockfileVersion: "9",
    packages: ["10.0.0", "2.0.0", "1.0.0-beta.10", "1.0.0-beta.2"].map(
      (version) => ({ name: "leaf", version }),
    ),
  };
  const report = createDiffReport(snapshot, snapshot, { packages: ["leaf"] });
  assert.equal(report.summary.changes, 0);
  assert.deepEqual(
    report.packages[0]?.before.map(({ version }) => version),
    ["1.0.0-beta.2", "1.0.0-beta.10", "2.0.0", "10.0.0"],
  );
  assert.deepEqual(report.packages[0]?.changes, []);
});

test("cycles terminate, shared consumers merge evidence, and comparison is immutable and order independent", () => {
  const snapshot = (version: string): Lockfile =>
    lock({
      projects,
      nodes: [
        root,
        node("a", "a", "1.0.0"),
        node("b", "b", "1.0.0"),
        leaf("leaf", version),
      ],
      edges: [
        edge(root.id, "a", "a"),
        edge(root.id, "b", "b"),
        edge("a", "b", "b"),
        edge("b", "a", "a"),
        edge("a", "leaf", "leaf"),
      ],
    });
  const before = snapshot("1.0.0");
  const after = snapshot("2.0.0");
  const original = JSON.stringify([before, after]);
  const report = createDiffReport(before, after);
  assert.equal(report.changes.length, 1);
  assert.equal(report.changes[0]?.references.length, 1);
  assert.equal(JSON.stringify([before, after]), original);
  const reverseOrder = (file: Lockfile): Lockfile => ({
    ...file,
    packages: [...file.packages].reverse(),
    ...(file.graph
      ? {
          graph: {
            nodes: [...file.graph.nodes].reverse(),
            edges: [...file.graph.edges].reverse(),
            projects: [...file.graph.projects].reverse(),
          },
        }
      : {}),
  });
  assert.deepEqual(
    createDiffReport(reverseOrder(before), reverseOrder(after)),
    report,
  );
});

test("mixed semantic and opaque versions have one deterministic total order", () => {
  const values = ["2.0.0", "10.0.0", "11-opaque-source"];
  const result = (order: readonly string[]) => {
    const file: Lockfile = {
      manager: "npm",
      lockfileVersion: "3",
      packages: order.map((version) => ({ name: "mixed", version })),
    };
    return createDiffReport(file, file, {
      packages: ["mixed"],
    }).packages[0]?.before.map(({ version }) => version);
  };
  for (const order of [
    values,
    [...values].reverse(),
    [values[1] ?? "", values[2] ?? "", values[0] ?? ""],
  ]) {
    assert.deepEqual(result(order), ["2.0.0", "10.0.0", "11-opaque-source"]);
  }
});

test("legacy reference-only reports retain available consumer details with unknown scope", () => {
  const input = (version: string): Lockfile => ({
    manager: "npm",
    lockfileVersion: "3",
    packages: [{ name: "leaf", version }],
    references: [
      {
        id: "node_modules/parent/node_modules/leaf",
        name: "leaf",
        version,
        context: "parent → leaf",
      },
    ],
  });
  const report = createDiffReport(input("1.0.0"), input("2.0.0"));
  assert.equal(report.changes[0]?.match, "installation");
  assert.equal(
    report.packages[0]?.before[0]?.references[0]?.consumer,
    "parent → leaf",
  );
  assert.equal(report.packages[0]?.after[0]?.scope, "unknown");
});
