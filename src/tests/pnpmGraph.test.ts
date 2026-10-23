import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DependencyGraph, LockedPackage } from "../model.js";
import { buildPnpmGraph } from "../pnpmGraph.js";

const fixtureResolver =
  (
    entries: Readonly<Record<string, LockedPackage>>,
  ): ((alias: string, ref: string) => LockedPackage) =>
  (alias, ref) => {
    const entry = entries[`${alias}:${ref}`] ?? entries[ref];
    assert.ok(entry, `Unexpected fixture resolution: ${alias}:${ref}`);
    return entry;
  };

const node = (graph: DependencyGraph, id: string) => {
  const result = graph.nodes.find((entry) => entry.id === id);
  assert.ok(result, `Missing graph node ${id}`);
  return result;
};

const edge = (graph: DependencyGraph, from: string, alias: string) => {
  const result = graph.edges.find(
    (entry) => entry.from === from && entry.alias === alias,
  );
  assert.ok(result, `Missing graph edge ${from} → ${alias}`);
  return result;
};

const reachable = (
  graph: DependencyGraph,
  start: string,
): ReadonlySet<string> => {
  const seen = new Set<string>();
  const visit = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const entry of graph.edges) if (entry.from === id) visit(entry.to);
  };
  visit(start);
  return seen;
};

const host = { name: "@fixture/host", version: "1.0.0" };
const leaf1 = { name: "@fixture/leaf", version: "1.0.0" };
const leaf2 = { name: "@fixture/leaf", version: "2.0.0" };
const peer1 = "@fixture/host@1.0.0(@fixture/peer@1.0.0)";
const peer2 = "@fixture/host@1.0.0(@fixture/peer@2.0.0)";
const peerResolver = fixtureResolver({
  "@fixture/host@1.0.0": host,
  [peer1]: host,
  [peer2]: host,
  "1.0.0(@fixture/peer@1.0.0)": host,
  "1.0.0(@fixture/peer@2.0.0)": host,
  "@fixture/leaf@1.0.0": leaf1,
  "@fixture/leaf@2.0.0": leaf2,
  "@fixture/leaf:1.0.0": leaf1,
  "@fixture/leaf:2.0.0": leaf2,
});

const peerFixture = (swap: boolean): Record<string, unknown> => ({
  importers: {
    "apps/web": {
      dependencies: {
        "@fixture/host": {
          version: `1.0.0(@fixture/peer@${swap ? "2" : "1"}.0.0)`,
        },
      },
    },
    "apps/api": {
      dependencies: {
        "@fixture/host": {
          version: `1.0.0(@fixture/peer@${swap ? "1" : "2"}.0.0)`,
        },
      },
    },
  },
  packages: {
    "@fixture/host@1.0.0": {},
    "@fixture/leaf@1.0.0": {},
    "@fixture/leaf@2.0.0": {},
  },
  snapshots: {
    [peer1]: { dependencies: { "@fixture/leaf": "1.0.0" } },
    [peer2]: { dependencies: { "@fixture/leaf": "2.0.0" } },
    "@fixture/leaf@1.0.0": {},
    "@fixture/leaf@2.0.0": {},
  },
});

describe("pnpm dependency graph", () => {
  it("preserves the exact peer snapshot selected by each workspace", () => {
    const before = buildPnpmGraph(peerFixture(false), "9.0", peerResolver);
    const after = buildPnpmGraph(peerFixture(true), "9.0", peerResolver);
    assert.equal(
      edge(before, "project:apps/web", "@fixture/host").to,
      `pnpm:${peer1}`,
    );
    assert.equal(
      edge(after, "project:apps/web", "@fixture/host").to,
      `pnpm:${peer2}`,
    );
    assert.equal(
      edge(before, "project:apps/api", "@fixture/host").to,
      `pnpm:${peer2}`,
    );
    assert.equal(
      edge(after, "project:apps/api", "@fixture/host").to,
      `pnpm:${peer1}`,
    );
    assert.notDeepEqual(before, after);
    for (const key of [peer1, peer2]) {
      assert.equal(node(before, `pnpm:${key}`).version, "1.0.0");
      assert.equal(node(before, `pnpm:${key}`).label, key);
    }
    assert.equal(
      edge(before, `pnpm:${peer1}`, "@fixture/leaf").to,
      "pnpm:@fixture/leaf@1.0.0",
    );
    assert.equal(
      edge(before, `pnpm:${peer2}`, "@fixture/leaf").to,
      "pnpm:@fixture/leaf@2.0.0",
    );
  });

  it("retains child edges under each versioned parent node", () => {
    const graph = buildPnpmGraph(
      {
        importers: {
          ".": {
            dependencies: { current: { version: "@fixture/host@2.0.0" } },
          },
        },
        packages: {
          "@fixture/host@1.0.0": {},
          "@fixture/host@2.0.0": {},
          "@fixture/leaf@1.0.0": {},
          "@fixture/leaf@2.0.0": {},
        },
        snapshots: {
          "@fixture/host@1.0.0": { dependencies: { "@fixture/leaf": "1.0.0" } },
          "@fixture/host@2.0.0": { dependencies: { "@fixture/leaf": "2.0.0" } },
          "@fixture/leaf@1.0.0": {},
          "@fixture/leaf@2.0.0": {},
        },
      },
      "9.0",
      fixtureResolver({
        "@fixture/host@1.0.0": host,
        "@fixture/host@2.0.0": { name: "@fixture/host", version: "2.0.0" },
        "@fixture/leaf@1.0.0": leaf1,
        "@fixture/leaf@2.0.0": leaf2,
        "@fixture/leaf:1.0.0": leaf1,
        "@fixture/leaf:2.0.0": leaf2,
      }),
    );
    assert.equal(
      edge(graph, "project:.", "current").to,
      "pnpm:@fixture/host@2.0.0",
    );
    assert.equal(
      edge(graph, "pnpm:@fixture/host@1.0.0", "@fixture/leaf").to,
      "pnpm:@fixture/leaf@1.0.0",
    );
    assert.equal(
      edge(graph, "pnpm:@fixture/host@2.0.0", "@fixture/leaf").to,
      "pnpm:@fixture/leaf@2.0.0",
    );
  });

  for (const legacy of [true, false]) {
    it(`resolves scoped aliases, registry prefixes and peers in pnpm ${legacy ? "5.4" : "6"}`, () => {
      const parentKey = legacy
        ? "/registry.example/@fixture/host/1.0.0_@fixture+peer@2.0.0"
        : "/registry.example/@fixture/host@1.0.0(@fixture/peer@2.0.0)";
      const parentRef = legacy
        ? "1.0.0_@fixture+peer@2.0.0"
        : "1.0.0(@fixture/peer@2.0.0)";
      const childKey = legacy ? "/@fixture/leaf/2.0.0" : "/@fixture/leaf@2.0.0";
      const graph = buildPnpmGraph(
        {
          dependencies: { "@fixture/host": parentRef },
          packages: {
            [parentKey]: { dependencies: { shortcut: childKey } },
            [childKey]: {},
          },
        },
        legacy ? "5.4" : "6.0",
        fixtureResolver({
          [parentKey]: host,
          [parentRef]: host,
          [childKey]: leaf2,
        }),
      );
      const parentId = `pnpm:${parentKey.slice(1)}`;
      assert.equal(edge(graph, "project:.", "@fixture/host").to, parentId);
      const child = node(graph, edge(graph, parentId, "shortcut").to);
      assert.equal(child.name, "@fixture/leaf");
      assert.equal(child.version, "2.0.0");
      assert.match(node(graph, parentId).label ?? "", /peer/);
    });
  }

  it("connects relative workspace links to normalized project roots", () => {
    const graph = buildPnpmGraph(
      {
        importers: {
          ".": { dependencies: { ui: { version: "link:./packages/ui" } } },
          "./apps/web/": {
            dependencies: { ui: { version: "link:../../packages/ui" } },
          },
          "packages/ui": {
            dependencies: { "@fixture/leaf": { version: "1.0.0" } },
          },
        },
        packages: { "@fixture/leaf@1.0.0": {} },
        snapshots: { "@fixture/leaf@1.0.0": {} },
      },
      "9.0",
      fixtureResolver({
        "link:./packages/ui": { name: "ui", version: "link:./packages/ui" },
        "link:../../packages/ui": {
          name: "ui",
          version: "link:../../packages/ui",
        },
        "@fixture/leaf@1.0.0": leaf1,
        "1.0.0": leaf1,
      }),
    );
    assert.deepEqual(
      graph.projects.map((project) => project.id),
      [".", "apps/web", "packages/ui"],
    );
    for (const path of [".", "apps/web"]) {
      const found = reachable(graph, `project:${path}`);
      assert.ok(found.has("pnpm:@fixture/leaf@1.0.0"));
      const linked = node(graph, edge(graph, `project:${path}`, "ui").to);
      assert.match(linked.version, /^link:/);
      assert.equal(
        edge(graph, linked.id, "@fixture/leaf").to,
        "pnpm:@fixture/leaf@1.0.0",
      );
    }
    assert.equal(
      graph.edges.some((entry) => entry.to.startsWith("project:")),
      false,
    );
  });

  it("keeps aliases and opaque Git identities without turning commits into versions", () => {
    const remote = "git+https://example.invalid/source.git#abcdef";
    const graph = buildPnpmGraph(
      {
        importers: {
          ".": {
            dependencies: {
              shortcut: { version: "npm:@fixture/leaf@2.0.0" },
              remote: { version: remote },
            },
          },
        },
        packages: {
          "@fixture/leaf@2.0.0": {},
          [remote]: { name: "@fixture/remote", version: "1.0.0" },
        },
        snapshots: { "@fixture/leaf@2.0.0": {}, [remote]: {} },
      },
      "9.0",
      fixtureResolver({
        "@fixture/leaf@2.0.0": leaf2,
        "npm:@fixture/leaf@2.0.0": leaf2,
        [remote]: { name: "@fixture/remote", version: remote },
      }),
    );
    assert.equal(
      node(graph, edge(graph, "project:.", "shortcut").to).name,
      "@fixture/leaf",
    );
    assert.equal(edge(graph, "project:.", "remote").to, `pnpm:${remote}`);
    assert.equal(node(graph, `pnpm:${remote}`).version, remote);
  });

  it("deduplicates repeated resolutions while retaining dependency categories", () => {
    const graph = buildPnpmGraph(
      {
        importers: {
          ".": {
            dependencies: { "@fixture/leaf": { version: "1.0.0" } },
            devDependencies: { "@fixture/leaf": { version: "1.0.0" } },
            optionalDependencies: { "@fixture/leaf": { version: "1.0.0" } },
          },
        },
        packages: { "@fixture/leaf@1.0.0": {} },
        snapshots: { "@fixture/leaf@1.0.0": {} },
      },
      "9.0",
      fixtureResolver({ "@fixture/leaf@1.0.0": leaf1, "1.0.0": leaf1 }),
    );
    assert.deepEqual(graph.edges, [
      {
        from: "project:.",
        to: "pnpm:@fixture/leaf@1.0.0",
        alias: "@fixture/leaf",
        categories: ["dependencies", "devDependencies", "optionalDependencies"],
      },
    ]);
  });

  it("marks resolved peers without inventing installations from peer ranges", () => {
    const parent = "@fixture/has_underscore@1.0.0";
    const selected = `${parent}(@fixture/leaf@2.0.0)`;
    const canonical = { name: "@fixture/has_underscore", version: "1.0.0" };
    const graph = buildPnpmGraph(
      {
        importers: { ".": { dependencies: { parent: { version: selected } } } },
        packages: {
          [parent]: {
            peerDependencies: { "@fixture/leaf": "^2.0.0", absent: "^3.0.0" },
          },
          "@fixture/leaf@2.0.0": {},
        },
        snapshots: {
          [selected]: { dependencies: { "@fixture/leaf": "2.0.0" } },
          "@fixture/leaf@2.0.0": {},
        },
      },
      "9.0",
      fixtureResolver({
        [parent]: canonical,
        [selected]: canonical,
        "@fixture/leaf@2.0.0": leaf2,
        "2.0.0": leaf2,
      }),
    );
    assert.deepEqual(
      edge(graph, `pnpm:${selected}`, "@fixture/leaf").categories,
      ["dependencies", "peerDependencies"],
    );
    assert.equal(
      graph.edges.some((entry) => entry.alias === "absent"),
      false,
    );
  });

  it("does not mistake an absolute external link for a relative workspace", () => {
    const graph = buildPnpmGraph(
      {
        importers: {
          ".": { dependencies: { ui: { version: "link:/packages/ui" } } },
          "packages/ui": {
            dependencies: { "@fixture/leaf": { version: "1.0.0" } },
          },
        },
        packages: { "@fixture/leaf@1.0.0": {} },
      },
      "9.0",
      fixtureResolver({
        "link:/packages/ui": { name: "ui", version: "link:/packages/ui" },
        "@fixture/leaf@1.0.0": leaf1,
        "1.0.0": leaf1,
      }),
    );
    assert.equal(
      reachable(graph, "project:.").has("pnpm:@fixture/leaf@1.0.0"),
      false,
    );
    assert.equal(
      node(graph, edge(graph, "project:.", "ui").to).location,
      undefined,
    );
  });

  it("ignores absent optional installations and preserves known terminal resolutions", () => {
    const graph = buildPnpmGraph(
      {
        importers: {
          ".": {
            dependencies: { required: { version: "1.0.0" } },
            optionalDependencies: { absent: { version: "2.0.0" } },
          },
        },
        packages: {},
        snapshots: {},
      },
      "9.0",
      fixtureResolver({
        "required:1.0.0": { name: "required", version: "1.0.0" },
        "absent:2.0.0": { name: "absent", version: "2.0.0" },
      }),
    );
    assert.equal(
      node(graph, edge(graph, "project:.", "required").to).version,
      "1.0.0",
    );
    assert.equal(
      graph.edges.some((entry) => entry.alias === "absent"),
      false,
    );
  });

  it("rejects malformed consumed dependency maps and references", () => {
    const invalid = [
      { importers: [] },
      { importers: { ".": { dependencies: [] } } },
      { importers: { ".": { dependencies: { leaf: { version: 1 } } } } },
      { packages: { "@fixture/leaf@1.0.0": null } },
      {
        snapshots: {
          "@fixture/leaf@1.0.0": {
            dependencies: { leaf: { version: "1.0.0" } },
          },
        },
      },
    ];
    for (const root of invalid) {
      assert.throws(() =>
        buildPnpmGraph(
          root,
          "9.0",
          fixtureResolver({ "@fixture/leaf@1.0.0": leaf1 }),
        ),
      );
    }
  });
});
