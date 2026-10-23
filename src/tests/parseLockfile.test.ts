import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Effect } from "effect";
import { parseLockfile } from "../parseLockfile.js";

const parseJson = (value: unknown) =>
  Effect.runPromise(parseLockfile(JSON.stringify(value), "package-lock.json"));

describe("npm lockfiles", () => {
  it("parses a real npm-generated v3 lockfile with linked scoped packages", async () => {
    const text = readFileSync(
      new URL(
        "fixtures/parser-generated/npm-package-lock.json",
        import.meta.url,
      ),
      "utf8",
    );
    const result = await Effect.runPromise(parseLockfile(text));
    assert.equal(result.lockfileVersion, "3");
    assert.deepEqual(result.packages, [
      { name: "leaf", version: "link:../leaf" },
      { name: "ui", version: "link:../workspace-ui" },
    ]);
  });

  it("preserves Git commits even when package metadata has the same SemVer", async () => {
    const result = await parseJson({
      lockfileVersion: 3,
      packages: {
        "node_modules/remote": {
          version: "1.0.0",
          resolved: "git+https://example.com/remote.git#abc",
        },
      },
    });
    assert.deepEqual(result.packages, [
      { name: "remote", version: "git+https://example.com/remote.git#abc" },
    ]);
  });

  it("preserves declared tarball URL refs while registry packages remain semantic versions", async () => {
    const result = await parseJson({
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { remote: "https://example.com/archive.tgz" } },
        "node_modules/remote": {
          version: "1.0.0",
          resolved: "https://example.com/archive.tgz",
        },
        "node_modules/registry": {
          version: "1.0.0",
          resolved:
            "https://custom-registry.example/registry/-/registry-1.0.0.tgz",
        },
      },
    });
    assert.deepEqual(result.packages, [
      { name: "registry", version: "1.0.0" },
      { name: "remote", version: "https://example.com/archive.tgz" },
    ]);
  });

  it("keeps an alias target change distinct from a version change", async () => {
    const before = await parseJson({
      lockfileVersion: 3,
      packages: { "node_modules/tool": { name: "old-tool", version: "1.0.0" } },
    });
    const after = await parseJson({
      lockfileVersion: 3,
      packages: { "node_modules/tool": { name: "new-tool", version: "1.0.0" } },
    });
    assert.deepEqual(before.packages, [{ name: "old-tool", version: "1.0.0" }]);
    assert.deepEqual(after.packages, [{ name: "new-tool", version: "1.0.0" }]);
  });
  for (const lockfileVersion of [2, 3]) {
    it(`reads v${lockfileVersion} installed packages without root or workspace metadata`, async () => {
      const result = await parseJson({
        name: "root-project",
        version: "9.0.0",
        lockfileVersion,
        packages: {
          "": { name: "root-project", version: "9.0.0" },
          "packages/ui": { name: "ui", version: "8.0.0" },
          "node_modules/zod": { version: "3.2.1" },
          "node_modules/host/node_modules/zod": { version: "3.1.0" },
          "node_modules/other/node_modules/zod": { version: "3.2.1" },
          "node_modules/@scope/tool": { version: "1.0.0-beta.1+build.7" },
        },
        dependencies: { staleV1Copy: { version: "99.0.0" } },
      });
      const { graph, ...inventory } = result;
      assert.ok(graph);
      assert.deepEqual(
        graph.projects.map(({ id }) => id),
        ["."],
      );
      assert.equal(graph.edges.length, 0);
      assert.deepEqual(inventory, {
        manager: "npm",
        lockfileVersion: String(lockfileVersion),
        packages: [
          { name: "@scope/tool", version: "1.0.0-beta.1+build.7" },
          { name: "zod", version: "3.1.0" },
          { name: "zod", version: "3.2.1" },
        ],
        references: [
          {
            id: "node_modules/@scope/tool",
            name: "@scope/tool",
            version: "1.0.0-beta.1+build.7",
          },
          {
            id: "node_modules/host/node_modules/zod",
            name: "zod",
            version: "3.1.0",
            context: "node_modules/host/node_modules/zod",
          },
          {
            id: "node_modules/other/node_modules/zod",
            name: "zod",
            version: "3.2.1",
            context: "node_modules/other/node_modules/zod",
          },
          { id: "node_modules/zod", name: "zod", version: "3.2.1" },
        ],
      });
    });
  }

  it("walks v1 nested dependencies and retains opaque resolutions", async () => {
    const result = await parseJson({
      lockfileVersion: 1,
      dependencies: {
        parent: {
          version: "2.0.0",
          dependencies: {
            "@scope/tool": { version: "1.0.0" },
            parent: { version: "1.0.0" },
          },
        },
        remote: { version: "git+https://example.com/remote.git#abc" },
      },
    });
    assert.deepEqual(result.packages, [
      { name: "@scope/tool", version: "1.0.0" },
      { name: "parent", version: "1.0.0" },
      { name: "parent", version: "2.0.0" },
      { name: "remote", version: "git+https://example.com/remote.git#abc" },
    ]);
  });

  it("uses actual package names for modern npm aliases", async () => {
    const result = await parseJson({
      lockfileVersion: 3,
      packages: {
        "node_modules/alias": { name: "@scope/actual", version: "1.2.3" },
        "node_modules/actual-again": {
          name: "@scope/actual",
          version: "1.2.3",
        },
      },
    });
    assert.deepEqual(result.packages, [
      { name: "@scope/actual", version: "1.2.3" },
    ]);
  });

  it("retains npm links and opaque installed resolutions", async () => {
    const result = await parseJson({
      lockfileVersion: 3,
      packages: {
        "node_modules/@scope/ui": { resolved: "packages/ui", link: true },
        "node_modules/remote": {
          resolved: "git+https://example.com/a.git#abc",
        },
      },
    });
    assert.deepEqual(result.packages, [
      { name: "@scope/ui", version: "link:packages/ui" },
      { name: "remote", version: "git+https://example.com/a.git#abc" },
    ]);
  });

  it("normalizes v1 npm alias versions", async () => {
    const result = await parseJson({
      lockfileVersion: 1,
      dependencies: { alias: { version: "npm:@scope/actual@1.2.3" } },
    });
    assert.deepEqual(result.packages, [
      { name: "@scope/actual", version: "1.2.3" },
    ]);
  });

  it("accepts empty npm inventories", async () => {
    assert.deepEqual((await parseJson({ lockfileVersion: 1 })).packages, []);
    assert.deepEqual(
      (await parseJson({ lockfileVersion: 3, packages: {} })).packages,
      [],
    );
  });

  it("accepts empty declared npm ranges, which mean any version", async () => {
    const result = await parseJson({
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { foo: "" } },
        "node_modules/foo": { version: "1.0.0" },
      },
    });
    assert.deepEqual(result.packages, [{ name: "foo", version: "1.0.0" }]);
  });
});

describe("pnpm lockfiles", () => {
  it("parses a real pnpm 11-generated v9 lockfile with a named file dependency and link", async () => {
    const text = readFileSync(
      new URL("fixtures/parser-generated/pnpm-lock.yaml", import.meta.url),
      "utf8",
    );
    const result = await Effect.runPromise(parseLockfile(text));
    assert.equal(result.lockfileVersion, "9.0");
    assert.deepEqual(result.packages, [
      { name: "@fixture/leaf", version: "file:../leaf" },
      { name: "ui", version: "link:../workspace-ui" },
    ]);
  });

  it("preserves Git and URL identity even when package metadata contains a SemVer", async () => {
    const result = await Effect.runPromise(
      parseLockfile(`lockfileVersion: '9.0'
packages:
  github.com/example/remote/abcdef:
    name: remote
    version: 1.0.0
  'archive@https://example.com/archive-v2.tgz':
    version: 1.0.0
`),
    );
    assert.deepEqual(result.packages, [
      { name: "archive", version: "https://example.com/archive-v2.tgz" },
      { name: "remote", version: "github.com/example/remote/abcdef" },
    ]);
  });
  it("reads v5.4 scoped names and strips readable or hashed peer contexts", async () => {
    const result = await Effect.runPromise(
      parseLockfile(`lockfileVersion: 5.4
dependencies:
  foo: 1.2.3_react@18.2.0
packages:
  /foo/1.2.3_react@18.2.0: {}
  /foo/1.2.3_wxpgugna4ivthu7yyu4fmciltu: {}
  /@scope/tool/2.0.0-beta.1+build.7: {}
`),
    );
    const { graph, ...inventory } = result;
    assert.ok(graph);
    assert.equal(graph.nodes.filter(({ name }) => name === "foo").length, 2);
    assert.match(graph.edges[0]?.to ?? "", /foo\/1\.2\.3_react@18\.2\.0$/);
    assert.deepEqual(inventory, {
      manager: "pnpm",
      lockfileVersion: "5.4",
      packages: [
        { name: "@scope/tool", version: "2.0.0-beta.1+build.7" },
        { name: "foo", version: "1.2.3" },
      ],
      references: [{ id: "importer:.:foo", name: "foo", version: "1.2.3" }],
    });
  });

  it("reads v6 package IDs and custom registry paths", async () => {
    const result = await Effect.runPromise(
      parseLockfile(`lockfileVersion: '6.0'
packages:
  /foo@1.2.3(react@18.2.0): {}
  /@scope/tool@2.0.0: {}
  registry.example.com/@scope/custom@4.0.0: {}
`),
    );
    assert.deepEqual(result.packages, [
      { name: "@scope/custom", version: "4.0.0" },
      { name: "@scope/tool", version: "2.0.0" },
      { name: "foo", version: "1.2.3" },
    ]);
  });

  it("reads v9 package metadata without double-counting snapshots", async () => {
    const result = await Effect.runPromise(
      parseLockfile(`lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      alias:
        specifier: npm:button@^1.0.0
        version: button@1.0.0(react@18.0.0)
packages:
  button@1.0.0: {}
  '@scope/tool@2.0.0-rc.1+build.7': {}
snapshots:
  button@1.0.0(react@18.0.0(react-dom@18.0.0)): {}
  button@1.0.0(react@19.0.0): {}
  '@scope/tool@2.0.0-rc.1+build.7': {}
`),
    );
    assert.deepEqual(result.packages, [
      { name: "@scope/tool", version: "2.0.0-rc.1+build.7" },
      { name: "button", version: "1.0.0" },
    ]);
  });

  it("does not truncate an invalid SemVer identifier as if it had a peer suffix", async () => {
    const result = await Effect.runPromise(
      parseLockfile(`lockfileVersion: '9.0'
packages:
  'foo@01.0.0(react@18.0.0)': {}
  'bar@1.0.0-01(react@18.0.0)': {}
`),
    );
    assert.deepEqual(result.packages, [
      { name: "bar", version: "1.0.0-01(react@18.0.0)" },
      { name: "foo", version: "01.0.0(react@18.0.0)" },
    ]);
  });

  it("uses package metadata names while retaining non-registry reference identity", async () => {
    const result = await Effect.runPromise(
      parseLockfile(`lockfileVersion: '6.0'
packages:
  github.com/example/library/abcdef:
    name: actual-library
    version: 1.2.3
  file:../local-package:
    name: local-package
    version: 2.0.0
`),
    );
    assert.deepEqual(result.packages, [
      { name: "actual-library", version: "github.com/example/library/abcdef" },
      { name: "local-package", version: "file:../local-package" },
    ]);
  });

  it("retains local and opaque refs from workspace importers", async () => {
    const result = await Effect.runPromise(
      parseLockfile(`lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      registry:
        specifier: ^1.0.0
        version: 1.2.3
      ui:
        specifier: workspace:*
        version: link:packages/ui
  apps/app:
    devDependencies:
      remote:
        specifier: git+https://example.com/remote.git
        version: git+https://example.com/remote.git#abc
    optionalDependencies:
      local:
        specifier: file:../../local.tgz
        version: file:../../local.tgz
packages:
  registry@1.2.3: {}
`),
    );
    assert.deepEqual(result.packages, [
      { name: "local", version: "file:../../local.tgz" },
      { name: "registry", version: "1.2.3" },
      { name: "remote", version: "git+https://example.com/remote.git#abc" },
      { name: "ui", version: "link:packages/ui" },
    ]);
  });

  it("retains local links from legacy root importers", async () => {
    const result = await Effect.runPromise(
      parseLockfile(`lockfileVersion: 5.4
dependencies:
  ui: link:../ui
packages: {}
`),
    );
    assert.deepEqual(result.packages, [{ name: "ui", version: "link:../ui" }]);
  });

  it("selects the project document after the boot/toolchain document", async () => {
    const result = await Effect.runPromise(
      parseLockfile(`---
lockfileVersion: '9.0'
packages:
  pnpm@12.3.4: {}
---
lockfileVersion: '9.0'
packages:
  react@19.0.0: {}
`),
    );
    assert.deepEqual(result.packages, [{ name: "react", version: "19.0.0" }]);
  });

  it("accepts empty pnpm lockfiles", async () => {
    const result = await Effect.runPromise(
      parseLockfile("lockfileVersion: '9.0'\n"),
    );
    assert.deepEqual(result.packages, []);
  });

  it("detects pnpm written in JSON syntax", async () => {
    const result = await Effect.runPromise(
      parseLockfile(
        JSON.stringify({
          lockfileVersion: "9.0",
          packages: { "foo@1.2.3": {} },
        }),
      ),
    );
    assert.equal(result.manager, "pnpm");
    assert.deepEqual(result.packages, [{ name: "foo", version: "1.2.3" }]);
  });
});

describe("stable dependency references", () => {
  it("uses the same npm installation identities across all supported lockfile versions", async () => {
    const dependencies = {
      alias: { version: "npm:@scope/actual@1.0.0" },
      parent: {
        version: "2.0.0",
        dependencies: { child: { version: "1.0.0" } },
      },
    };
    const packages = {
      "node_modules/alias": { name: "@scope/actual", version: "1.0.0" },
      "node_modules/parent": { version: "2.0.0" },
      "node_modules/parent/node_modules/child": { version: "1.0.0" },
    };
    const expected = [
      {
        id: "node_modules/alias",
        name: "@scope/actual",
        version: "1.0.0",
        context: "node_modules/alias",
      },
      { id: "node_modules/parent", name: "parent", version: "2.0.0" },
      {
        id: "node_modules/parent/node_modules/child",
        name: "child",
        version: "1.0.0",
        context: "node_modules/parent/node_modules/child",
      },
    ];
    for (const lockfileVersion of [1, 2, 3]) {
      const result = await parseJson(
        lockfileVersion === 1
          ? { lockfileVersion, dependencies }
          : { lockfileVersion, packages },
      );
      assert.deepEqual(result.references, expected);
    }
  });

  it("retains npm consumer swaps when the inventory stays identical", async () => {
    const before = await parseJson({
      lockfileVersion: 3,
      packages: {
        "node_modules/left/node_modules/foo": { version: "1.0.0" },
        "node_modules/right/node_modules/foo": { version: "2.0.0" },
      },
    });
    const after = await parseJson({
      lockfileVersion: 3,
      packages: {
        "node_modules/left/node_modules/foo": { version: "2.0.0" },
        "node_modules/right/node_modules/foo": { version: "1.0.0" },
      },
    });
    assert.deepEqual(before.packages, after.packages);
    assert.notDeepEqual(before.references, after.references);
    assert.deepEqual(
      before.references?.map(({ id }) => id),
      after.references?.map(({ id }) => id),
    );
  });

  it("tracks pnpm direct refs by importer and alias, with readable context", async () => {
    const result = await Effect.runPromise(
      parseLockfile(`lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      foo: {specifier: ^1.0.0, version: 1.0.0}
      alias: {specifier: 'npm:@scope/tool@^2.0.0', version: '@scope/tool@2.0.0'}
  apps/site:
    devDependencies:
      foo: {specifier: ^2.0.0, version: 2.0.0}
packages:
  foo@1.0.0: {}
  foo@2.0.0: {}
  '@scope/tool@2.0.0': {}
`),
    );
    assert.deepEqual(result.references, [
      {
        id: "importer:.:alias",
        name: "@scope/tool",
        version: "2.0.0",
        context: "alias → @scope/tool",
      },
      { id: "importer:.:foo", name: "foo", version: "1.0.0" },
      {
        id: "importer:apps/site:foo",
        name: "foo",
        version: "2.0.0",
        context: "apps/site → foo",
      },
    ]);
  });

  it("does not change pnpm reference identity when moving dev to prod", async () => {
    const create = (field: string) =>
      parseLockfile(`lockfileVersion: '9.0'
importers:
  .:
    ${field}:
      foo: {specifier: ^1.0.0, version: 1.0.0}
packages:
  foo@1.0.0: {}
`);
    const before = await Effect.runPromise(create("devDependencies"));
    const after = await Effect.runPromise(create("dependencies"));
    assert.ok(before.references?.length);
    assert.deepEqual(before.references, after.references);
  });

  it("resolves link, file and opaque Git references consistently with the catalog", async () => {
    const result = await Effect.runPromise(
      parseLockfile(`lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      leaf: {specifier: 'file:../leaf', version: '@scope/leaf@file:../leaf'}
      ui: {specifier: 'workspace:*', version: 'link:../ui'}
      alias: {specifier: 'github:example/remote', version: 'github.com/example/remote/abcdef'}
packages:
  '@scope/leaf@file:../leaf': {}
  github.com/example/remote/abcdef:
    name: actual-remote
    version: 1.0.0
`),
    );
    assert.deepEqual(result.references, [
      {
        id: "importer:.:alias",
        name: "actual-remote",
        version: "github.com/example/remote/abcdef",
        context: "alias → actual-remote",
      },
      {
        id: "importer:.:leaf",
        name: "@scope/leaf",
        version: "file:../leaf",
        context: "leaf → @scope/leaf",
      },
      { id: "importer:.:ui", name: "ui", version: "link:../ui" },
    ]);
  });

  for (const [lockfileVersion, parentKey, childKey] of [
    ["5.4", "/parent/1.0.0", "/@scope/child/2.0.0"],
    ["6.0", "/parent@1.0.0", "/@scope/child@2.0.0"],
  ]) {
    it(`tracks transitive dependency edges for pnpm v${lockfileVersion}`, async () => {
      const result = await Effect.runPromise(
        parseLockfile(`lockfileVersion: '${lockfileVersion}'
packages:
  '${parentKey}':
    dependencies:
      alias: '${childKey}'
    optionalDependencies:
      local: link:../local
  '${childKey}': {}
`),
      );
      assert.deepEqual(result.references, [
        {
          id: `parent:${parentKey}:alias`,
          name: "@scope/child",
          version: "2.0.0",
          context: "parent@1.0.0 → alias",
        },
        {
          id: `parent:${parentKey}:local`,
          name: "local",
          version: "link:../local",
          context: "parent@1.0.0 → local",
        },
      ]);
    });
  }

  it("tracks v9 snapshot edges without treating peer suffixes as version changes", async () => {
    const result = await Effect.runPromise(
      parseLockfile(`lockfileVersion: '9.0'
packages:
  parent@1.0.0: {}
  child@2.0.0: {}
snapshots:
  parent@1.0.0(react@18.0.0):
    dependencies:
      child: 2.0.0(react@18.0.0)
  parent@1.0.0(react@19.0.0):
    dependencies:
      child: 2.0.0(react@19.0.0)
  child@2.0.0(react@18.0.0): {}
  child@2.0.0(react@19.0.0): {}
`),
    );
    assert.deepEqual(result.references, [
      {
        id: "parent:parent@1.0.0(react@18.0.0):child",
        name: "child",
        version: "2.0.0",
        context: "parent@1.0.0 → child",
      },
      {
        id: "parent:parent@1.0.0(react@19.0.0):child",
        name: "child",
        version: "2.0.0",
        context: "parent@1.0.0 → child",
      },
    ]);
  });

  it("deduplicates equal pnpm references repeated across dependency categories", async () => {
    const result = await Effect.runPromise(
      parseLockfile(`lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      foo: {specifier: ^1.0.0, version: 1.0.0}
    optionalDependencies:
      foo: {specifier: ^1.0.0, version: 1.0.0}
packages:
  foo@1.0.0: {}
`),
    );
    assert.deepEqual(result.references, [
      { id: "importer:.:foo", name: "foo", version: "1.0.0" },
    ]);
  });
});

describe("typed lockfile failures", () => {
  const invalidCases: ReadonlyArray<readonly [string, string, RegExp]> = [
    ["malformed JSON", '{"lockfileVersion":3,', /JSON|parse/i],
    ["malformed YAML", "lockfileVersion: '9.0'\npackages: [", /YAML|parse/i],
    [
      "duplicate YAML keys",
      "lockfileVersion: '9.0'\npackages: {}\npackages: {}",
      /YAML|duplicate/i,
    ],
    ["empty text", "", /empty|object|lockfile/i],
    ["null", "null", /object|lockfile/i],
    ["array", "[]", /object|lockfile/i],
    ["missing lockfile version", '{"packages":{}}', /lockfileVersion/i],
    [
      "unsupported npm version",
      '{"lockfileVersion":4,"packages":{}}',
      /unsupported|version/i,
    ],
    [
      "unsupported pnpm version",
      "lockfileVersion: '10.0'\npackages: {}",
      /unsupported|version/i,
    ],
    [
      "malformed npm packages",
      '{"lockfileVersion":3,"packages":[]}',
      /packages/i,
    ],
    ["missing modern npm packages", '{"lockfileVersion":3}', /packages/i],
    [
      "invalid npm package entry",
      '{"lockfileVersion":3,"packages":{"node_modules/foo":42}}',
      /foo|package/i,
    ],
    [
      "missing npm version",
      '{"lockfileVersion":3,"packages":{"node_modules/foo":{}}}',
      /version|resolution/i,
    ],
    [
      "numeric npm version",
      '{"lockfileVersion":1,"dependencies":{"foo":{"version":123}}}',
      /version/i,
    ],
    [
      "malformed npm dependencies",
      '{"lockfileVersion":1,"dependencies":[]}',
      /dependencies/i,
    ],
    [
      "malformed npm declared dependency map",
      '{"lockfileVersion":3,"packages":{"":{"dependencies":[]}}}',
      /dependencies/i,
    ],
    [
      "non-string npm declared dependency",
      '{"lockfileVersion":3,"packages":{"":{"dependencies":{"foo":42}}}}',
      /foo|string/i,
    ],
    [
      "malformed pnpm packages",
      "lockfileVersion: '9.0'\npackages: []",
      /packages/i,
    ],
    [
      "malformed pnpm key",
      "lockfileVersion: '9.0'\npackages:\n  not-a-package-id: {}",
      /not-a-package-id|name|version/i,
    ],
    [
      "numeric pnpm metadata",
      "lockfileVersion: '9.0'\npackages:\n  foo@1.2.3:\n    version: 42",
      /version/i,
    ],
    [
      "invalid pnpm importer",
      "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      foo: {}",
      /version|foo/i,
    ],
    [
      "malformed pnpm snapshot entry",
      "lockfileVersion: '9.0'\nsnapshots:\n  foo@1.0.0: null",
      /snapshot|foo|object/i,
    ],
    [
      "malformed pnpm transitive ref",
      "lockfileVersion: '9.0'\nsnapshots:\n  foo@1.0.0:\n    dependencies:\n      child: 42",
      /child|version|string/i,
    ],
    [
      "malformed pnpm transitive dependency map",
      "lockfileVersion: '6.0'\npackages:\n  /foo@1.0.0:\n    dependencies: []",
      /dependencies/i,
    ],
    [
      "conflicting pnpm reference categories",
      "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      foo: {version: 1.0.0}\n    optionalDependencies:\n      foo: {version: 2.0.0}",
      /conflict|foo/i,
    ],
  ];

  for (const [label, content, pattern] of invalidCases) {
    it(`rejects ${label} with the source preserved`, async () => {
      const error = await Effect.runPromise(
        Effect.flip(parseLockfile(content, "broken.lock")),
      );
      assert.equal(error._tag, "LockfileError");
      assert.equal(error.source, "broken.lock");
      assert.match(error.message, pattern);
    });
  }

  it("respects an explicit manager instead of silently changing parser", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        parseLockfile(
          "lockfileVersion: '9.0'\npackages: {}",
          "custom.lock",
          "npm",
        ),
      ),
    );
    assert.equal(error._tag, "LockfileError");
    assert.match(error.message, /JSON|npm/i);
  });
});
