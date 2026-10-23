import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyChange } from "../classifyChange.js";
import type { VersionChange } from "../model.js";

const cases: readonly [string, string, VersionChange][] = [
  ["1.2.3", "2.0.0", { direction: "upgrade", step: "major" }],
  ["2.0.0", "1.99.99", { direction: "downgrade", step: "major" }],
  ["1.2.9", "1.3.0", { direction: "upgrade", step: "minor" }],
  ["1.3.0", "1.2.99", { direction: "downgrade", step: "minor" }],
  ["1.2.3", "1.2.4", { direction: "upgrade", step: "patch" }],
  ["1.2.4", "1.2.3", { direction: "downgrade", step: "patch" }],
  ["0.1.0", "0.2.0", { direction: "upgrade", step: "minor" }],
  ["0.9.0", "1.0.0", { direction: "upgrade", step: "major" }],
  ["1.0.0-beta.2", "1.0.0-beta.10", { direction: "upgrade", step: "suffix" }],
  ["1.0.0-beta.10", "1.0.0-beta.2", { direction: "downgrade", step: "suffix" }],
  ["1.0.0-alpha", "1.0.0-beta", { direction: "upgrade", step: "suffix" }],
  ["1.0.0-rc.1", "1.0.0", { direction: "upgrade", step: "suffix" }],
  ["1.0.0", "1.0.0-rc.1", { direction: "downgrade", step: "suffix" }],
  ["1.0.0+build.1", "1.0.0+build.2", { direction: "changed", step: "suffix" }],
  ["1.0.0", "1.0.0+linux", { direction: "changed", step: "suffix" }],
  ["1.0.0+linux", "1.0.0", { direction: "changed", step: "suffix" }],
  [
    "1.0.0-beta.1+old",
    "1.0.0-beta.2+new",
    { direction: "upgrade", step: "suffix" },
  ],
  ["1.9.9+old", "2.0.0-beta.1+new", { direction: "upgrade", step: "major" }],
  ["2.0.0-beta.1", "1.99.99", { direction: "downgrade", step: "major" }],
  ["1.0.0-beta.1", "1.1.0-alpha.1", { direction: "upgrade", step: "minor" }],
  ["1.0.0-beta.1", "1.0.1-alpha.1", { direction: "upgrade", step: "patch" }],
  ["1.2.3", "1.2.3", { direction: "unchanged", step: "none" }],
  ["v1.2.3", "1.2.3", { direction: "unchanged", step: "none" }],
  ["v1.2.3+build.1", "1.2.3+build.1", { direction: "unchanged", step: "none" }],
  [
    "link:../workspace",
    "link:../workspace",
    { direction: "unchanged", step: "none" },
  ],
  ["link:../old", "link:../new", { direction: "changed", step: "unknown" }],
  [
    "git+https://example.com/pkg#abc",
    "git+https://example.com/pkg#def",
    { direction: "changed", step: "unknown" },
  ],
  ["^1.2.3", "^2.0.0", { direction: "changed", step: "unknown" }],
  ["1.2", "1.2.3", { direction: "changed", step: "unknown" }],
  ["1.2.3", "latest", { direction: "changed", step: "unknown" }],
  ["01.2.3", "1.2.3", { direction: "changed", step: "unknown" }],
  ["", "1.2.3", { direction: "changed", step: "unknown" }],
];

for (const [before, after, expected] of cases) {
  test(`classifies ${JSON.stringify(before)} → ${JSON.stringify(after)}`, () => {
    assert.deepEqual(classifyChange(before, after), expected);
  });
}
