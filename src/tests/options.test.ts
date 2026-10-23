import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect } from "effect";
import { parseOptions, shouldUseColor } from "../options.js";

test("options default to table output with direction and step", async () => {
  const options = await Effect.runPromise(parseOptions([]));
  assert.deepEqual(options.positionals, []);
  assert.equal(options.columns, undefined);
  assert.equal(options.context, "auto");
  assert.equal(options.scope, "all");
  assert.equal(options.summary, true);
  assert.equal(options.details, false);
  assert.deepEqual(options.packages, []);
  assert.equal(options.json, false);
  assert.equal(options.color, "auto");
});

test("accepts git options, legacy positionals, and selected columns", async () => {
  const options = await Effect.runPromise(
    parseOptions([
      "HEAD~1",
      "HEAD",
      "--columns",
      "package,before,after,step",
      "--exit-code",
      "--no-color",
    ]),
  );
  assert.deepEqual(options.positionals, ["HEAD~1", "HEAD"]);
  assert.deepEqual(options.columns, ["package", "before", "after", "step"]);
  assert.equal(options.exitCode, true);
  assert.equal(options.color, "never");
});

test("explicit file pair can select pnpm and custom cwd", async () => {
  const options = await Effect.runPromise(
    parseOptions([
      "--before",
      "old.yaml",
      "--after",
      "new.yaml",
      "--manager",
      "pnpm",
      "--cwd",
      "repo",
    ]),
  );
  assert.equal(options.before, "old.yaml");
  assert.equal(options.after, "new.yaml");
  assert.equal(options.manager, "pnpm");
  assert.equal(options.cwd, "repo");
});

for (const args of [
  ["--wat"],
  ["--context", "sometimes"],
  ["--scope", "production"],
  ["--workspace", ""],
  ["--workspace", "../outside"],
  ["--workspace", "/absolute"],
  ["--package", ""],
  ["--before", "old.json"],
  ["--after", "new.json"],
  ["--columns", "package,wat"],
  ["--columns", "package,package"],
  ["--columns", ""],
  ["--color", "blue"],
  ["--manager", "yarn"],
  ["--from", "main", "other"],
  ["--before", "a", "--after", "b", "HEAD"],
  ["--before", "a", "--after", "b", "--lockfile", "foo"],
  ["a", "b", "c", "d"],
  ["--from", ""],
  ["--cwd", ""],
]) {
  test(`rejects invalid options ${JSON.stringify(args)}`, async () => {
    const failure = await Effect.runPromise(Effect.flip(parseOptions(args)));
    assert.equal(failure._tag, "InputError");
    assert.ok(failure.message.length > 0);
  });
}

test("color honors terminal detection, explicit flags, NO_COLOR, and FORCE_COLOR", () => {
  assert.equal(shouldUseColor("auto", false, {}), false);
  assert.equal(shouldUseColor("auto", true, {}), true);
  assert.equal(shouldUseColor("auto", true, { NO_COLOR: "1" }), false);
  assert.equal(shouldUseColor("auto", true, { NO_COLOR: "" }), true);
  assert.equal(shouldUseColor("auto", false, { FORCE_COLOR: "1" }), true);
  assert.equal(shouldUseColor("auto", true, { FORCE_COLOR: "0" }), false);
  assert.equal(shouldUseColor("auto", true, { TERM: "dumb" }), false);
  assert.equal(shouldUseColor("always", false, { NO_COLOR: "1" }), true);
  assert.equal(shouldUseColor("never", true, { FORCE_COLOR: "1" }), false);
  assert.equal(
    shouldUseColor("auto", true, { NO_COLOR: "1", FORCE_COLOR: "1" }),
    false,
  );
});

test("parses independent report controls, repeatable package filters, and normalized workspaces", async () => {
  const options = await Effect.runPromise(
    parseOptions([
      "--columns",
      "package,context,scope,after",
      "--context",
      "never",
      "--scope",
      "both",
      "--workspace",
      "./apps/web/",
      "--package",
      "@scope/a",
      "--package",
      "b",
      "--package",
      "@scope/a",
      "--details",
      "--no-summary",
    ]),
  );
  assert.deepEqual(options.columns, ["package", "context", "scope", "after"]);
  assert.equal(options.context, "never");
  assert.equal(options.scope, "both");
  assert.equal(options.workspace, "apps/web");
  assert.deepEqual(options.packages, ["@scope/a", "b"]);
  assert.equal(options.details, true);
  assert.equal(options.summary, false);
  const root = await Effect.runPromise(parseOptions(["--workspace", "."]));
  assert.equal(root.workspace, ".");
});
