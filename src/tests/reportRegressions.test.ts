import assert from "node:assert/strict";
import { test } from "node:test";
import { createDiffReport } from "../diffLockfiles.js";
import type { Lockfile } from "../model.js";

/** A project can share a name/version with an unrelated installed registry copy. */
function projectNameCollision(version: string, referenced = false): Lockfile {
  return {
    manager: "npm",
    lockfileVersion: "3",
    packages: [
      { name: "self", version: "1.0.0" },
      { name: "self", version: "2.0.0" },
    ],
    graph: {
      nodes: [
        { id: "project:app", name: "self", version },
        { id: "project:consumer", name: "consumer", version: "1.0.0" },
        { id: "orphan-1", name: "self", version: "1.0.0" },
        { id: "orphan-2", name: "self", version: "2.0.0" },
      ],
      projects: [
        { id: "apps/self", node: "project:app" },
        { id: "apps/consumer", node: "project:consumer" },
      ],
      edges: referenced
        ? [
            {
              from: "project:consumer",
              to: "project:app",
              alias: "self",
              categories: ["dependencies"],
            },
          ]
        : [],
    },
  };
}

test("workspace project metadata cannot include unrelated installed packages with the same identity", () => {
  const report = createDiffReport(
    projectNameCollision("1.0.0"),
    projectNameCollision("2.0.0"),
    { workspace: "apps/self", packages: ["self"] },
  );
  assert.deepEqual(report.changes, []);
  assert.deepEqual(report.packages, []);
  assert.equal(report.summary.changes, 0);
  assert.equal(report.total.changes, 0);
});

test("a workspace project actually referenced as a dependency remains in that consumer's inventory", () => {
  const report = createDiffReport(
    projectNameCollision("1.0.0", true),
    projectNameCollision("2.0.0", true),
    { workspace: "apps/consumer", packages: ["self"] },
  );
  assert.equal(report.changes.length, 1);
  assert.equal(report.changes[0]?.row.direction, "upgrade");
  assert.equal(report.changes[0]?.scope, "direct");
  assert.equal(report.changes[0]?.match, "dependency");
  assert.deepEqual(
    report.packages[0]?.before.map(({ version }) => version),
    ["1.0.0"],
  );
  assert.deepEqual(
    report.packages[0]?.after.map(({ version }) => version),
    ["2.0.0"],
  );
});
