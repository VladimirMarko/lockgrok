import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect } from "effect";
import { createDiffReport } from "../diffLockfiles.js";
import type { DiffReport, PackageDetail } from "../model.js";
import { parseLockfile } from "../parseLockfile.js";

const npm = (packages: Record<string, unknown>) =>
  Effect.runPromise(
    parseLockfile(
      JSON.stringify({ lockfileVersion: 3, packages }),
      "package-lock.json",
    ),
  );

function detail(report: DiffReport, name: string): PackageDetail {
  const found = report.packages.find((entry) => entry.package === name);
  assert.ok(found, `Missing package details for ${name}`);
  return found;
}

test("npm hoisting changes preserve consumer versions without fictitious upgrade or downgrade rows", async () => {
  const parents = {
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
  const before = await npm({
    ...parents,
    "node_modules/shared": { version: "2.0.0" },
    "node_modules/left/node_modules/shared": { version: "1.0.0" },
  });
  const after = await npm({
    ...parents,
    "node_modules/shared": { version: "1.0.0" },
    "node_modules/right/node_modules/shared": { version: "2.0.0" },
  });
  const report = createDiffReport(before, after, { packages: ["shared"] });
  assert.deepEqual(report.changes, []);
  assert.equal(report.summary.changes, 0);
  const shared = detail(report, "shared");
  assert.deepEqual(shared.retained, ["1.0.0", "2.0.0"]);
  for (const versions of [shared.before, shared.after]) {
    assert.deepEqual(
      versions.map(({ version, scope, references }) => ({
        version,
        scope,
        consumers: references.map(({ consumer }) => consumer),
      })),
      [
        {
          version: "1.0.0",
          scope: "transitive",
          consumers: ["left@1.0.0"],
        },
        {
          version: "2.0.0",
          scope: "transitive",
          consumers: ["right@1.0.0"],
        },
      ],
    );
  }
});

test("npm real root and parent consumer swaps remain visible when installed versions are identical", async () => {
  const lock = (direct: string, indirect: string) =>
    npm({
      "": { dependencies: { parent: "1", shared: direct } },
      "node_modules/parent": {
        version: "1.0.0",
        dependencies: { shared: indirect },
      },
      "node_modules/shared": { version: direct },
      "node_modules/parent/node_modules/shared": { version: indirect },
    });
  const report = createDiffReport(
    await lock("1.0.0", "2.0.0"),
    await lock("2.0.0", "1.0.0"),
  );
  assert.deepEqual(
    report.changes.map(({ row, scope, match }) => ({ row, scope, match })),
    [
      {
        row: {
          package: "shared",
          before: "1.0.0",
          after: "2.0.0",
          direction: "upgrade",
          step: "major",
        },
        scope: "direct",
        match: "dependency",
      },
      {
        row: {
          package: "shared",
          before: "2.0.0",
          after: "1.0.0",
          direction: "downgrade",
          step: "major",
          context: "parent@1.0.0 → shared",
        },
        scope: "transitive",
        match: "dependency",
      },
    ],
  );
  assert.deepEqual(detail(report, "shared").retained, ["1.0.0", "2.0.0"]);
  assert.equal(report.summary.packages, 1);
  assert.equal(report.summary.upgrade, 1);
  assert.equal(report.summary.downgrade, 1);
});

test("npm aliases match the declared alias while reporting the resolved package identity", async () => {
  const lock = (version: string) =>
    npm({
      "": { dependencies: { frontend: `npm:renderer@${version}` } },
      "node_modules/frontend": { name: "renderer", version },
    });
  const report = createDiffReport(await lock("1.0.0"), await lock("1.1.0"));
  assert.equal(report.changes.length, 1);
  const change = report.changes[0];
  assert.ok(change);
  assert.deepEqual(change.row, {
    package: "renderer",
    before: "1.0.0",
    after: "1.1.0",
    direction: "upgrade",
    step: "minor",
    context: "frontend → renderer",
  });
  assert.equal(change.scope, "direct");
  assert.equal(change.match, "dependency");
  assert.equal(change.references[0]?.before?.alias, "frontend");
});

test("npm alias target replacements are removal and addition rather than cross-package version changes", async () => {
  const lock = (name: string, version: string) =>
    npm({
      "": { dependencies: { frontend: `npm:${name}@${version}` } },
      "node_modules/frontend": { name, version },
    });
  const report = createDiffReport(
    await lock("old-renderer", "9.0.0"),
    await lock("new-renderer", "1.0.0"),
  );
  assert.deepEqual(
    report.changes.map(({ row, scope }) => ({
      package: row.package,
      direction: row.direction,
      scope,
    })),
    [
      { package: "new-renderer", direction: "add", scope: "direct" },
      { package: "old-renderer", direction: "remove", scope: "direct" },
    ],
  );
  assert.equal(report.summary.upgrade, 0);
  assert.equal(report.summary.downgrade, 0);
});

test("npm workspace links provide both scope globally and directness relative to the selected workspace", async () => {
  const lock = (version: string, projectVersion: string) =>
    npm({
      "": {
        name: "application",
        version: projectVersion,
        workspaces: ["packages/*"],
        dependencies: { ui: "file:packages/ui" },
      },
      "packages/ui": {
        name: "ui",
        version: projectVersion,
        dependencies: { leaf: version },
      },
      "node_modules/ui": { resolved: "packages/ui", link: true },
      "node_modules/leaf": { version },
    });
  const before = await lock("1.0.0", "4.0.0");
  const after = await lock("2.0.0", "5.0.0");
  const report = createDiffReport(before, after);
  assert.equal(report.changes.length, 1);
  const change = report.changes[0];
  assert.ok(change);
  assert.deepEqual(change.row, {
    package: "leaf",
    before: "1.0.0",
    after: "2.0.0",
    direction: "upgrade",
    step: "major",
    context: "packages/ui → leaf",
  });
  assert.equal(change.scope, "both");
  assert.deepEqual(change.references[0]?.after?.projects, [".", "packages/ui"]);
  assert.equal(detail(report, "leaf").after[0]?.scope, "both");

  const workspace = createDiffReport(before, after, {
    workspace: "packages/ui",
  });
  assert.equal(workspace.changes[0]?.scope, "direct");
  assert.equal(detail(workspace, "leaf").after[0]?.scope, "direct");
  assert.deepEqual(workspace.changes[0]?.references[0]?.after?.projects, [
    "packages/ui",
  ]);
  const root = createDiffReport(before, after, { workspace: "." });
  assert.equal(root.changes[0]?.scope, "transitive");
  assert.equal(detail(root, "leaf").after[0]?.scope, "transitive");
  assert.deepEqual(root.changes[0]?.references[0]?.after?.projects, ["."]);
});

test("npm root and linked workspace metadata version bumps alone are not dependency changes", async () => {
  const lock = (version: string) =>
    npm({
      "": {
        name: "application",
        version,
        workspaces: ["packages/*"],
        dependencies: { ui: "file:packages/ui" },
      },
      "packages/ui": {
        name: "ui",
        version,
        dependencies: { leaf: "1.0.0" },
      },
      "node_modules/ui": { resolved: "packages/ui", link: true },
      "node_modules/leaf": { version: "1.0.0" },
    });
  const before = await lock("1.0.0");
  const after = await lock("99.0.0");
  assert.deepEqual(before.packages, after.packages);
  assert.deepEqual(createDiffReport(before, after).changes, []);
});

test("npm local links traverse consumer declarations without declaring a local target to be a workspace", async () => {
  const lock = (version: string) =>
    npm({
      "": { dependencies: { adapter: "file:vendor/adapter" } },
      "node_modules/adapter": { resolved: "vendor/adapter", link: true },
      "vendor/adapter": {
        name: "adapter",
        version: "1.0.0",
        dependencies: { leaf: version },
      },
      "node_modules/leaf": { version },
    });
  const before = await lock("1.0.0");
  const after = await lock("1.0.1");
  assert.deepEqual(after.graph?.projects, [{ id: ".", node: "." }]);
  const report = createDiffReport(before, after);
  assert.equal(report.changes.length, 1);
  assert.equal(
    report.changes[0]?.row.context,
    "adapter@link:vendor/adapter → leaf",
  );
  assert.equal(report.changes[0]?.scope, "transitive");
  assert.equal(report.changes[0]?.match, "dependency");
});

test("unlinked npm workspaces remain direct roots without leaking their changes into root-only scope", async () => {
  const lock = (version: string) =>
    npm({
      "": { workspaces: ["packages/*"] },
      "packages/worker": { dependencies: { leaf: version } },
      "node_modules/leaf": { version },
    });
  const before = await lock("1.0.0");
  const after = await lock("2.0.0");
  const report = createDiffReport(before, after);
  assert.equal(report.changes[0]?.scope, "direct");
  assert.equal(report.changes[0]?.row.context, "packages/worker → leaf");
  assert.deepEqual(
    createDiffReport(before, after, { workspace: "." }).changes,
    [],
  );
  assert.equal(
    createDiffReport(before, after, { workspace: "packages/worker" }).changes
      .length,
    1,
  );
});

test("npm v1 consumer requirements are useful evidence without invented root directness", async () => {
  const lock = (version: string) =>
    Effect.runPromise(
      parseLockfile(
        JSON.stringify({
          lockfileVersion: 1,
          dependencies: {
            parent: { version: "1.0.0", requires: { leaf: version } },
            leaf: { version },
          },
        }),
        "legacy/package-lock.json",
      ),
    );
  const report = createDiffReport(await lock("1.0.0"), await lock("2.0.0"));
  assert.equal(report.changes.length, 1);
  assert.equal(report.changes[0]?.match, "dependency");
  assert.equal(report.changes[0]?.scope, "unknown");
  assert.equal(report.changes[0]?.row.context, "parent@1.0.0 → leaf");
  assert.deepEqual(
    detail(report, "leaf").before[0]?.references[0]?.projects,
    [],
  );
});

test("installed peers supply direct scope while absent optional dependencies do not become invented rows", async () => {
  const lock = (version: string) =>
    npm({
      "": {
        optionalDependencies: { platform: "1" },
        peerDependencies: { host: "*" },
      },
      "node_modules/host": { version },
    });
  const report = createDiffReport(await lock("1.0.0"), await lock("1.0.1"));
  assert.equal(report.changes.length, 1);
  assert.equal(report.changes[0]?.row.package, "host");
  assert.equal(report.changes[0]?.scope, "direct");
});
