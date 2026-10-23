import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DependencyEdge,
  DependencyGraph,
  DependencyReference,
  ResolvedNode,
} from "../model.js";
import { buildNpmGraph } from "../npmGraph.js";

const ref = (
  id: string,
  name: string,
  version = "1.0.0",
): DependencyReference => ({ id, name, version });

const graph = (
  packages: Record<string, unknown>,
  references: readonly DependencyReference[],
) => buildNpmGraph({ packages }, "3", references);

function edge(
  result: DependencyGraph,
  from: string,
  alias: string,
): DependencyEdge {
  const found = result.edges.find(
    (entry) => entry.from === from && entry.alias === alias,
  );
  assert.ok(found, `Missing edge from ${from} to alias ${alias}`);
  return found;
}

function node(result: DependencyGraph, id: string): ResolvedNode {
  const found = result.nodes.find((entry) => entry.id === id);
  assert.ok(found, `Missing node ${id}`);
  return found;
}

test("root declarations resolve installed targets and merge categories without inferring directness from depth", () => {
  const result = graph(
    {
      "": {
        dependencies: { tool: "^1" },
        devDependencies: { tool: "^1" },
        optionalDependencies: { tool: "^1", absent: "^2" },
        peerDependencies: { tool: "^1" },
      },
      "node_modules/tool": { version: "1.0.0" },
      "node_modules/orphan": { version: "2.0.0" },
    },
    [
      ref("node_modules/tool", "tool"),
      ref("node_modules/orphan", "orphan", "2.0.0"),
    ],
  );
  assert.deepEqual(result.projects, [{ id: ".", node: "." }]);
  assert.deepEqual(result.edges, [
    {
      from: ".",
      to: "node_modules/tool",
      alias: "tool",
      categories: [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ],
    },
  ]);
  assert.equal(node(result, "node_modules/orphan").version, "2.0.0");
});

test("consumer resolution is invariant when unchanged versions exchange hoisted and nested locations", () => {
  const base = {
    "": { dependencies: { left: "1", right: "1" } },
    "node_modules/left": {
      version: "1.0.0",
      dependencies: { shared: "^1" },
    },
    "node_modules/right": {
      version: "1.0.0",
      dependencies: { shared: "^2" },
    },
  };
  const parents = [
    ref("node_modules/left", "left"),
    ref("node_modules/right", "right"),
  ];
  const before = graph(
    {
      ...base,
      "node_modules/shared": { version: "2.0.0" },
      "node_modules/left/node_modules/shared": { version: "1.0.0" },
    },
    [
      ...parents,
      ref("node_modules/shared", "shared", "2.0.0"),
      ref("node_modules/left/node_modules/shared", "shared"),
    ],
  );
  const after = graph(
    {
      ...base,
      "node_modules/shared": { version: "1.0.0" },
      "node_modules/right/node_modules/shared": { version: "2.0.0" },
    },
    [
      ...parents,
      ref("node_modules/shared", "shared"),
      ref("node_modules/right/node_modules/shared", "shared", "2.0.0"),
    ],
  );
  for (const result of [before, after]) {
    assert.equal(
      node(result, edge(result, "node_modules/left", "shared").to).version,
      "1.0.0",
    );
    assert.equal(
      node(result, edge(result, "node_modules/right", "shared").to).version,
      "2.0.0",
    );
    assert.equal(
      result.edges.some(
        (entry) => entry.from === "." && entry.alias === "shared",
      ),
      false,
    );
  }
});

test("scoped consumers find the nearest valid ancestor installation", () => {
  const result = graph(
    {
      "": {},
      "node_modules/@scope/parent": {
        version: "1.0.0",
        dependencies: { "@scope/leaf": "*" },
      },
      "node_modules/@scope/parent/node_modules/@scope/leaf": {
        version: "2.0.0",
      },
      "node_modules/@scope/leaf": { version: "3.0.0" },
    },
    [
      ref("node_modules/@scope/parent", "@scope/parent"),
      ref(
        "node_modules/@scope/parent/node_modules/@scope/leaf",
        "@scope/leaf",
        "2.0.0",
      ),
      ref("node_modules/@scope/leaf", "@scope/leaf", "3.0.0"),
    ],
  );
  assert.equal(
    edge(result, "node_modules/@scope/parent", "@scope/leaf").to,
    "node_modules/@scope/parent/node_modules/@scope/leaf",
  );
});

test("workspace links use one traversable project node while preserving their resolved link identity", () => {
  const result = graph(
    {
      "": {
        name: "application",
        version: "99.0.0",
        workspaces: ["packages/*"],
        dependencies: { ui: "file:packages/ui" },
      },
      "packages/ui": {
        name: "ui",
        version: "42.0.0",
        dependencies: { leaf: "^2" },
      },
      "node_modules/ui": { resolved: "packages/ui", link: true },
      "packages/ui/node_modules/leaf": { version: "2.0.0" },
      "node_modules/leaf": { version: "1.0.0" },
    },
    [
      ref("node_modules/ui", "ui", "link:packages/ui"),
      ref("packages/ui/node_modules/leaf", "leaf", "2.0.0"),
      ref("node_modules/leaf", "leaf"),
    ],
  );
  assert.deepEqual(result.projects, [
    { id: ".", node: "." },
    { id: "packages/ui", node: "packages/ui" },
  ]);
  const workspace = node(result, edge(result, ".", "ui").to);
  assert.equal(workspace.id, "packages/ui");
  assert.equal(workspace.name, "ui");
  assert.equal(workspace.version, "link:packages/ui");
  assert.equal(
    edge(result, workspace.id, "leaf").to,
    "packages/ui/node_modules/leaf",
  );
});

test("workspace patterns support normalization, braces, globstars and exclusions", () => {
  const result = graph(
    {
      "": {
        workspaces: {
          packages: [
            "./{apps,packages}/**/",
            "!packages/excluded",
            "tools/tool?",
          ],
        },
      },
      "./apps/web/": { name: "web", version: "1.0.0" },
      "packages/group/lib": { name: "lib", version: "1.0.0" },
      "packages/excluded": { name: "excluded", version: "1.0.0" },
      "tools/tool1": { name: "tool1", version: "1.0.0" },
      "vendor/ordinary": { name: "ordinary", version: "1.0.0" },
    },
    [],
  );
  assert.deepEqual(
    result.projects.map((entry) => entry.id),
    [".", "apps/web", "packages/group/lib", "tools/tool1"],
  );
});

test("unlinked declared workspaces remain roots but unrelated local metadata does not", () => {
  const result = graph(
    {
      "": { workspaces: ["packages/[ab]"] },
      "packages/a": { dependencies: { shared: "*" } },
      "packages/b": {},
      "packages/c": {},
      "../outside": { dependencies: { shared: "*" } },
      "node_modules/shared": { version: "1.0.0" },
    },
    [ref("node_modules/shared", "shared")],
  );
  assert.deepEqual(
    result.projects.map((entry) => entry.id),
    [".", "packages/a", "packages/b"],
  );
  assert.equal(edge(result, "packages/a", "shared").to, "node_modules/shared");
});

test("workspace matching accepts npm extglobs and numeric brace expansions", () => {
  const result = graph(
    {
      "": {
        workspaces: [
          "@(apps|services)/*",
          "packages/item{1..2}",
          "tools/!(excluded)",
        ],
      },
      "apps/web": {},
      "services/api": {},
      "packages/item1": {},
      "packages/item2": {},
      "packages/item3": {},
      "tools/runner": {},
      "tools/excluded": {},
    },
    [],
  );
  assert.deepEqual(
    result.projects.map(({ id }) => id),
    [
      ".",
      "apps/web",
      "packages/item1",
      "packages/item2",
      "services/api",
      "tools/runner",
    ],
  );
});

test("workspace wildcards use npm dot-folder behavior and allow explicitly named hidden workspaces", () => {
  const result = graph(
    {
      "": { workspaces: ["packages/*", "packages/.visible"] },
      "packages/ordinary": {},
      "packages/.hidden": {},
      "packages/.visible": {},
    },
    [],
  );
  assert.deepEqual(
    result.projects.map(({ id }) => id),
    [".", "packages/.visible", "packages/ordinary"],
  );
});

test("workspace exclusions and later reinclusion follow npm virtual workspace matching", () => {
  const result = graph(
    {
      "": {
        workspaces: [
          "packages/**",
          "!packages/blocked/**",
          "packages/blocked/reincluded",
          "!!!packages/omitted",
          "!!./apps/[ab]",
          "/tools/*",
        ],
      },
      "packages/ordinary": {},
      "packages/blocked/reincluded": {},
      "packages/blocked/other": {},
      "packages/omitted": {},
      "apps/a": {},
      "apps/b": {},
      "tools/run": {},
    },
    [],
  );
  // npm removes a prior negative pattern when a later positive pattern matches
  // it, so the earlier broad positive pattern also includes blocked/other.
  assert.deepEqual(
    result.projects.map(({ id }) => id),
    [
      ".",
      "apps/a",
      "apps/b",
      "packages/blocked/other",
      "packages/blocked/reincluded",
      "packages/ordinary",
      "tools/run",
    ],
  );
});

test("incomplete glob syntax is matched as npm's library treats it instead of rejecting the lockfile", () => {
  const result = graph(
    {
      "": { workspaces: ["packages/[", "packages/{a,b"] },
      "packages/[": {},
      "packages/{a,b": {},
      "packages/ordinary": {},
    },
    [],
  );
  assert.deepEqual(
    result.projects.map(({ id }) => id),
    [".", "packages/[", "packages/{a,b"],
  );
});

test("local links traverse target declarations without inventing workspace roots", () => {
  const result = graph(
    {
      "": { dependencies: { local: "file:vendor/local" } },
      "node_modules/local": { link: true, resolved: "vendor/local" },
      "vendor/local": { dependencies: { shared: "*" } },
      "node_modules/shared": { version: "1.0.0" },
    },
    [
      ref("node_modules/local", "local", "link:vendor/local"),
      ref("node_modules/shared", "shared"),
    ],
  );
  assert.deepEqual(result.projects, [{ id: ".", node: "." }]);
  const local = edge(result, ".", "local").to;
  assert.equal(node(result, local).version, "link:vendor/local");
  assert.equal(edge(result, local, "shared").to, "node_modules/shared");
});

test("conflicting link aliases preserve each reference identity and share target declarations", () => {
  const result = graph(
    {
      "": {
        workspaces: ["packages/ui"],
        dependencies: { ui: "*", alternate: "*" },
      },
      "packages/ui": {
        name: "ui",
        dependencies: { leaf: "*" },
      },
      "node_modules/ui": { link: true, resolved: "packages/ui" },
      "node_modules/alternate": { link: true, resolved: "packages/ui" },
      "node_modules/leaf": { version: "1.0.0" },
    },
    [
      ref("node_modules/alternate", "alternate", "link:packages/ui"),
      ref("node_modules/ui", "ui", "link:packages/ui"),
      ref("node_modules/leaf", "leaf"),
    ],
  );
  const ui = node(result, edge(result, ".", "ui").to);
  const alternate = node(result, edge(result, ".", "alternate").to);
  assert.equal(ui.id, "packages/ui");
  assert.equal(ui.name, "ui");
  assert.equal(alternate.name, "alternate");
  assert.notEqual(ui.id, alternate.id);
  assert.equal(edge(result, ui.id, "leaf").to, "node_modules/leaf");
  assert.equal(edge(result, alternate.id, "leaf").to, "node_modules/leaf");
});

test("npm aliases and opaque references retain parser-resolved package identities", () => {
  const result = graph(
    {
      "": {
        dependencies: { friendly: "npm:@scope/actual@^2", git: "" },
      },
      "node_modules/friendly": { name: "@scope/actual", version: "2.3.4" },
      "node_modules/git": {
        version: "1.0.0",
        resolved: "git+https://example.invalid/repo#abc",
      },
    },
    [
      ref("node_modules/friendly", "@scope/actual", "2.3.4"),
      ref("node_modules/git", "git", "git+https://example.invalid/repo#abc"),
    ],
  );
  assert.equal(
    node(result, edge(result, ".", "friendly").to).name,
    "@scope/actual",
  );
  assert.equal(
    node(result, edge(result, ".", "git").to).version,
    "git+https://example.invalid/repo#abc",
  );
});

test("one installation can have both root and package consumers", () => {
  const result = graph(
    {
      "": { dependencies: { parent: "*", leaf: "*" } },
      "node_modules/parent": {
        version: "1.0.0",
        dependencies: { leaf: "*" },
      },
      "node_modules/leaf": { version: "1.0.0" },
    },
    [ref("node_modules/parent", "parent"), ref("node_modules/leaf", "leaf")],
  );
  assert.equal(edge(result, ".", "leaf").to, "node_modules/leaf");
  assert.equal(
    edge(result, "node_modules/parent", "leaf").to,
    "node_modules/leaf",
  );
});

test("legacy requires edges do not turn the top-level install list into root declarations", () => {
  const result = buildNpmGraph(
    {
      name: "legacy-project",
      dependencies: {
        parent: {
          version: "1.0.0",
          requires: { leaf: "^2" },
          dependencies: { leaf: { version: "2.0.0" } },
        },
        leaf: { version: "1.0.0" },
      },
    },
    "1",
    [
      ref("node_modules/parent", "parent"),
      ref("node_modules/parent/node_modules/leaf", "leaf", "2.0.0"),
      ref("node_modules/leaf", "leaf"),
    ],
  );
  assert.deepEqual(result.projects, [{ id: ".", node: "." }]);
  assert.equal(
    result.edges.some((entry) => entry.from === "."),
    false,
  );
  assert.deepEqual(edge(result, "node_modules/parent", "leaf"), {
    from: "node_modules/parent",
    to: "node_modules/parent/node_modules/leaf",
    alias: "leaf",
    categories: ["dependencies"],
  });
});

test("missing optional and peer installations are skipped without fabricating nodes", () => {
  const result = graph(
    {
      "": {
        optionalDependencies: { absent: "*" },
        peerDependencies: { absentPeer: "*", present: "*" },
      },
      "node_modules/present": { version: "1.0.0" },
    },
    [ref("node_modules/present", "present")],
  );
  assert.deepEqual(result.edges, [
    {
      from: ".",
      to: "node_modules/present",
      alias: "present",
      categories: ["peerDependencies"],
    },
  ]);
  assert.equal(result.nodes.length, 2);
});

test("dependency cycles and link cycles terminate without losing installed identities", () => {
  const result = graph(
    {
      "": { dependencies: { a: "*", loop: "*" } },
      "node_modules/a": { version: "1.0.0", dependencies: { b: "*" } },
      "node_modules/b": { version: "1.0.0", dependencies: { a: "*" } },
      "node_modules/loop": { link: true, resolved: "node_modules/again" },
      "node_modules/again": { link: true, resolved: "node_modules/loop" },
    },
    [
      ref("node_modules/a", "a"),
      ref("node_modules/b", "b"),
      ref("node_modules/loop", "loop", "link:node_modules/again"),
      ref("node_modules/again", "again", "link:node_modules/loop"),
    ],
  );
  assert.equal(edge(result, "node_modules/a", "b").to, "node_modules/b");
  assert.equal(edge(result, "node_modules/b", "a").to, "node_modules/a");
  assert.equal(
    node(result, edge(result, ".", "loop").to).version,
    "link:node_modules/again",
  );
  assert.equal(result.nodes.length, 5);
});

test("installed paths beneath a workspace symlink resolve from the real workspace location", () => {
  const result = graph(
    {
      "": { workspaces: ["packages/ui"], dependencies: { ui: "*" } },
      "packages/ui": { name: "ui", dependencies: { leaf: "*" } },
      "node_modules/ui": { link: true, resolved: "packages/ui" },
      "node_modules/ui/node_modules/leaf": { version: "2.0.0" },
      "node_modules/leaf": { version: "1.0.0" },
    },
    [
      ref("node_modules/ui", "ui", "link:packages/ui"),
      ref("node_modules/ui/node_modules/leaf", "leaf", "2.0.0"),
      ref("node_modules/leaf", "leaf"),
    ],
  );
  assert.equal(
    node(result, edge(result, "packages/ui", "leaf").to).version,
    "2.0.0",
  );
});

test("external link consumers do not accidentally resolve through the unrelated project root", () => {
  const result = graph(
    {
      "": { dependencies: { local: "file:../local" } },
      "../local": { dependencies: { leaf: "*" } },
      "node_modules/local": { link: true, resolved: "../local" },
      "node_modules/leaf": { version: "1.0.0" },
    },
    [
      ref("node_modules/local", "local", "link:../local"),
      ref("node_modules/leaf", "leaf"),
    ],
  );
  const local = edge(result, ".", "local").to;
  assert.equal(
    result.edges.some((entry) => entry.from === local),
    false,
  );
  assert.deepEqual(result.projects, [{ id: ".", node: "." }]);
});

for (const [field, value] of [
  ["dependencies", []],
  ["devDependencies", null],
  ["optionalDependencies", 7],
  ["peerDependencies", { tool: 1 }],
  ["dependencies", { tool: null }],
  ["dependencies", { "../invalid": "*" }],
] as const) {
  test(`rejects malformed consumed ${field} declaration ${JSON.stringify(value)}`, () => {
    assert.throws(
      () => graph({ "": { [field]: value } }, []),
      new RegExp(field),
    );
  });
}

for (const workspaces of [42, null, [1], { packages: "packages/*" }]) {
  test(`rejects malformed workspace declarations ${JSON.stringify(workspaces)}`, () => {
    assert.throws(
      () => graph({ "": { workspaces }, "packages/a": {} }, []),
      /workspace/i,
    );
  });
}

test("rejects malformed legacy requires even if its target is not installed", () => {
  assert.throws(
    () =>
      buildNpmGraph(
        {
          dependencies: {
            parent: { version: "1.0.0", requires: { absent: false } },
          },
        },
        "1",
        [ref("node_modules/parent", "parent")],
      ),
    /requires.*absent/,
  );
});

test("graph construction is deterministic and does not mutate input arrays or maps", () => {
  const packages = Object.freeze({
    "": Object.freeze({
      dependencies: Object.freeze({ z: "*", a: "*" }),
    }),
    "node_modules/z": Object.freeze({ version: "2.0.0" }),
    "node_modules/a": Object.freeze({ version: "1.0.0" }),
  });
  const references = Object.freeze([
    Object.freeze(ref("node_modules/z", "z", "2.0.0")),
    Object.freeze(ref("node_modules/a", "a")),
  ]);
  const before = structuredClone({ packages, references });
  const result = graph(packages, references);
  const reordered = graph(
    Object.fromEntries(Object.entries(packages).reverse()),
    [...references].reverse(),
  );
  assert.deepEqual(result, reordered);
  assert.deepEqual({ packages, references }, before);
  assert.deepEqual(
    result.edges.map((entry) => entry.alias),
    ["a", "z"],
  );
});
