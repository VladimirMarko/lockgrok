import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Effect } from "effect";
import { createDiffReport } from "../diffLockfiles.js";
import type { DiffOptions, DiffReport } from "../model.js";
import { parseLockfile } from "../parseLockfile.js";

const parse = (text: string) =>
  Effect.runPromise(parseLockfile(text, "pnpm-lock.yaml", "pnpm"));

const compare = async (
  before: string,
  after: string,
  options: DiffOptions = {},
): Promise<DiffReport> => {
  const [oldLock, newLock] = await Promise.all([parse(before), parse(after)]);
  return createDiffReport(oldLock, newLock, options);
};

const beforeParentUpdate = `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@fixture/parent-a': {specifier: 1.0.0, version: 1.0.0}
      '@fixture/parent-b': {specifier: 1.0.0, version: 1.0.0}
packages:
  '@fixture/parent-a@1.0.0': {}
  '@fixture/parent-b@1.0.0': {}
  '@fixture/leaf@1.0.0': {}
snapshots:
  '@fixture/parent-a@1.0.0':
    dependencies:
      '@fixture/leaf': 1.0.0
  '@fixture/parent-b@1.0.0':
    dependencies:
      '@fixture/leaf': 1.0.0
  '@fixture/leaf@1.0.0': {}
`;

const afterParentUpdate = `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@fixture/parent-a': {specifier: 2.0.0, version: 2.0.0}
      '@fixture/parent-b': {specifier: 1.0.0, version: 1.0.0}
packages:
  '@fixture/parent-a@2.0.0': {}
  '@fixture/parent-b@1.0.0': {}
  '@fixture/leaf@1.0.0': {}
  '@fixture/leaf@2.0.0': {}
snapshots:
  '@fixture/parent-a@2.0.0':
    dependencies:
      '@fixture/leaf': 2.0.0
  '@fixture/parent-b@1.0.0':
    dependencies:
      '@fixture/leaf': 1.0.0
  '@fixture/leaf@1.0.0': {}
  '@fixture/leaf@2.0.0': {}
`;

const beforeParentSwap = `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@fixture/parent-a': {specifier: 1.0.0, version: 1.0.0}
      '@fixture/parent-b': {specifier: 1.0.0, version: 1.0.0}
packages:
  '@fixture/parent-a@1.0.0': {}
  '@fixture/parent-b@1.0.0': {}
  '@fixture/leaf@1.0.0': {}
  '@fixture/leaf@2.0.0': {}
snapshots:
  '@fixture/parent-a@1.0.0':
    dependencies:
      '@fixture/leaf': 1.0.0
  '@fixture/parent-b@1.0.0':
    dependencies:
      '@fixture/leaf': 2.0.0
  '@fixture/leaf@1.0.0': {}
  '@fixture/leaf@2.0.0': {}
`;

const afterParentSwap = `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@fixture/parent-a': {specifier: 2.0.0, version: 2.0.0}
      '@fixture/parent-b': {specifier: 2.0.0, version: 2.0.0}
packages:
  '@fixture/parent-a@2.0.0': {}
  '@fixture/parent-b@2.0.0': {}
  '@fixture/leaf@1.0.0': {}
  '@fixture/leaf@2.0.0': {}
snapshots:
  '@fixture/parent-a@2.0.0':
    dependencies:
      '@fixture/leaf': 2.0.0
  '@fixture/parent-b@2.0.0':
    dependencies:
      '@fixture/leaf': 1.0.0
  '@fixture/leaf@1.0.0': {}
  '@fixture/leaf@2.0.0': {}
`;

const peerSnapshotSelections = (web: 1 | 2, api: 1 | 2): string => `
lockfileVersion: '9.0'
importers:
  apps/web:
    dependencies:
      '@fixture/host':
        specifier: 1.0.0
        version: 1.0.0(@fixture/peer@${web}.0.0)
  apps/api:
    dependencies:
      '@fixture/host':
        specifier: 1.0.0
        version: 1.0.0(@fixture/peer@${api}.0.0)
packages:
  '@fixture/host@1.0.0':
    peerDependencies:
      '@fixture/peer': '*'
  '@fixture/peer@1.0.0': {}
  '@fixture/peer@2.0.0': {}
  '@fixture/leaf@1.0.0': {}
  '@fixture/leaf@2.0.0': {}
snapshots:
  '@fixture/host@1.0.0(@fixture/peer@1.0.0)':
    dependencies:
      '@fixture/peer': 1.0.0
      '@fixture/leaf': 1.0.0
  '@fixture/host@1.0.0(@fixture/peer@2.0.0)':
    dependencies:
      '@fixture/peer': 2.0.0
      '@fixture/leaf': 2.0.0
  '@fixture/peer@1.0.0': {}
  '@fixture/peer@2.0.0': {}
  '@fixture/leaf@1.0.0': {}
  '@fixture/leaf@2.0.0': {}
`;

describe("pnpm parsed graph comparisons", () => {
  it("reports a child upgrade across a parent upgrade while the old child remains", async () => {
    const report = await compare(beforeParentUpdate, afterParentUpdate);
    assert.deepEqual(
      report.changes.map(({ row }) => row),
      [
        {
          package: "@fixture/leaf",
          before: "1.0.0",
          after: "2.0.0",
          direction: "upgrade",
          step: "major",
          context: "@fixture/parent-a@2.0.0 → @fixture/leaf",
        },
        {
          package: "@fixture/parent-a",
          before: "1.0.0",
          after: "2.0.0",
          direction: "upgrade",
          step: "major",
        },
      ],
    );
    const leaf = report.packages.find(
      (item) => item.package === "@fixture/leaf",
    );
    assert.deepEqual(leaf?.retained, ["1.0.0"]);
    assert.deepEqual(
      leaf?.after.map(({ version }) => version),
      ["1.0.0", "2.0.0"],
    );
    assert.equal(leaf?.changes[0]?.match, "dependency");
    assert.equal(leaf?.changes[0]?.scope, "transitive");
    assert.equal(
      leaf?.changes[0]?.references[0]?.before?.consumerId,
      "pnpm:@fixture/parent-a@1.0.0",
    );
    assert.equal(
      leaf?.changes[0]?.references[0]?.after?.consumerId,
      "pnpm:@fixture/parent-a@2.0.0",
    );
    assert.equal(report.summary.add, 0);
  });

  it("preserves both child directions when two changing parents exchange retained versions", async () => {
    const report = await compare(beforeParentSwap, afterParentSwap);
    const leaf = report.packages.find(
      (item) => item.package === "@fixture/leaf",
    );
    assert.deepEqual(
      leaf?.changes.map(({ row, scope, match }) => [
        row.before,
        row.after,
        row.direction,
        row.context,
        scope,
        match,
      ]),
      [
        [
          "1.0.0",
          "2.0.0",
          "upgrade",
          "@fixture/parent-a@2.0.0 → @fixture/leaf",
          "transitive",
          "dependency",
        ],
        [
          "2.0.0",
          "1.0.0",
          "downgrade",
          "@fixture/parent-b@2.0.0 → @fixture/leaf",
          "transitive",
          "dependency",
        ],
      ],
    );
    assert.deepEqual(leaf?.retained, ["1.0.0", "2.0.0"]);
    assert.deepEqual(report.summary, {
      packages: 3,
      changes: 4,
      upgrade: 3,
      downgrade: 1,
      add: 0,
      remove: 0,
      changed: 0,
    });
  });

  it("follows workspace peer selections while retaining distinct consumer evidence", async () => {
    const before = await parse(peerSnapshotSelections(1, 2));
    const after = await parse(peerSnapshotSelections(2, 1));
    assert.deepEqual(before.packages, after.packages);
    assert.notDeepEqual(before.graph, after.graph);
    const report = createDiffReport(before, after, {
      packages: ["@fixture/leaf", "@fixture/host"],
    });
    assert.deepEqual(
      report.changes.map(({ row }) => [
        row.package,
        row.direction,
        row.context,
      ]),
      [
        [
          "@fixture/leaf",
          "upgrade",
          "@fixture/host@1.0.0(@fixture/peer@2.0.0) → @fixture/leaf",
        ],
        [
          "@fixture/leaf",
          "downgrade",
          "@fixture/host@1.0.0(@fixture/peer@1.0.0) → @fixture/leaf",
        ],
      ],
    );
    assert.deepEqual(
      report.changes.map(({ references }) => references[0]?.after?.projects),
      [["apps/web"], ["apps/api"]],
    );
    assert.equal(
      report.changes[0]?.references[0]?.before?.consumerId,
      "pnpm:@fixture/host@1.0.0(@fixture/peer@1.0.0)",
    );
    assert.equal(
      report.changes[0]?.references[0]?.after?.consumerId,
      "pnpm:@fixture/host@1.0.0(@fixture/peer@2.0.0)",
    );
    assert.deepEqual(
      report.packages.find((item) => item.package === "@fixture/host")?.changes,
      [],
    );
    assert.deepEqual(
      report.packages.find((item) => item.package === "@fixture/leaf")
        ?.retained,
      ["1.0.0", "2.0.0"],
    );
  });

  it("projects inventories and scope from the selected workspace", async () => {
    const before = peerSnapshotSelections(1, 2);
    const after = peerSnapshotSelections(2, 1);
    const web = await compare(before, after, {
      workspace: "apps/web",
      packages: ["@fixture/leaf"],
      scope: "transitive",
    });
    assert.equal(web.workspace, "apps/web");
    assert.equal(web.changes.length, 1);
    assert.equal(web.changes[0]?.row.direction, "upgrade");
    assert.equal(web.changes[0]?.scope, "transitive");
    assert.deepEqual(
      web.packages[0]?.before.map(({ version, scope }) => [version, scope]),
      [["1.0.0", "transitive"]],
    );
    assert.deepEqual(
      web.packages[0]?.after.map(({ version, scope }) => [version, scope]),
      [["2.0.0", "transitive"]],
    );
    assert.deepEqual(web.packages[0]?.retained, []);
    const api = await compare(before, after, {
      workspace: "apps/api",
      packages: ["@fixture/leaf"],
    });
    assert.equal(api.changes[0]?.row.direction, "downgrade");
    const direct = await compare(before, after, {
      workspace: "apps/web",
      packages: ["@fixture/leaf"],
      scope: "direct",
    });
    assert.deepEqual(direct.changes, []);
    assert.equal(direct.total.changes, 2);
  });

  it("does not collapse equal changes under distinct peer snapshots", async () => {
    const source = (version: string): string => `lockfileVersion: '9.0'
importers:
  apps/web:
    dependencies:
      '@fixture/host': {version: '1.0.0(@fixture/peer@1.0.0)'}
  apps/api:
    dependencies:
      '@fixture/host': {version: '1.0.0(@fixture/peer@2.0.0)'}
packages:
  '@fixture/host@1.0.0': {}
  '@fixture/leaf@${version}': {}
snapshots:
  '@fixture/host@1.0.0(@fixture/peer@1.0.0)':
    dependencies:
      '@fixture/leaf': ${version}
  '@fixture/host@1.0.0(@fixture/peer@2.0.0)':
    dependencies:
      '@fixture/leaf': ${version}
  '@fixture/leaf@${version}': {}
`;
    const report = await compare(source("1.0.0"), source("2.0.0"));
    assert.equal(report.changes.length, 2);
    assert.deepEqual(
      report.changes.map(({ row }) => row.context),
      [
        "@fixture/host@1.0.0(@fixture/peer@1.0.0) → @fixture/leaf",
        "@fixture/host@1.0.0(@fixture/peer@2.0.0) → @fixture/leaf",
      ],
    );
    assert.deepEqual(
      report.changes.map(({ references }) => references[0]?.after?.projects),
      [["apps/web"], ["apps/api"]],
    );
    assert.ok(
      report.changes.every(
        ({ scope, match }) => scope === "transitive" && match === "dependency",
      ),
    );
  });

  it("traverses local workspace links while preserving directness relative to each project", async () => {
    const source = (version: string): string => `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      ui: {specifier: 'workspace:*', version: 'link:packages/ui'}
  packages/ui:
    dependencies:
      '@fixture/leaf': {specifier: '${version}', version: '${version}'}
packages:
  '@fixture/leaf@${version}': {}
snapshots:
  '@fixture/leaf@${version}': {}
`;
    const before = source("1.0.0");
    const after = source("2.0.0");
    const root = await compare(before, after, {
      workspace: ".",
      packages: ["@fixture/leaf"],
    });
    assert.equal(root.changes.length, 1);
    assert.equal(root.changes[0]?.scope, "transitive");
    assert.equal(
      root.changes[0]?.row.context,
      "ui@link:packages/ui → @fixture/leaf",
    );
    assert.deepEqual(root.changes[0]?.references[0]?.after?.projects, ["."]);
    const ui = await compare(before, after, {
      workspace: "packages/ui",
      packages: ["@fixture/leaf"],
    });
    assert.equal(ui.changes.length, 1);
    assert.equal(ui.changes[0]?.scope, "direct");
    assert.equal(ui.changes[0]?.row.context, "packages/ui → @fixture/leaf");
    const all = await compare(before, after, { packages: ["@fixture/leaf"] });
    assert.equal(all.packages[0]?.before[0]?.scope, "both");
    assert.ok(all.changes.every(({ row }) => row.package === "@fixture/leaf"));
  });
});
