import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";

const root = fileURLToPath(new URL("../..", import.meta.url));
const packageJson: unknown = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
);
const { version } = Schema.decodeUnknownSync(
  Schema.Struct({ version: Schema.String }),
)(packageJson);
const run = (args: readonly string[]) =>
  spawnSync(
    process.execPath,
    ["--import", "tsx", path.join(root, "src/index.ts"), ...args],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0" },
    },
  );
const demoArgs = [
  "--before",
  "examples/npm-before.json",
  "--after",
  "examples/npm-after.json",
];

test("the executable reports changes as 1 only with --exit-code", () => {
  assert.equal(run(demoArgs).status, 0);
  assert.equal(run([...demoArgs, "--exit-code"]).status, 1);
  assert.equal(
    run([
      "--before",
      "examples/npm-before.json",
      "--after",
      "examples/npm-before.json",
      "--exit-code",
    ]).status,
    0,
  );
});

test("the executable uses stderr and exit 2 for invalid options", () => {
  const result = run(["--not-an-option"]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /lockgrok:.*Unknown option/);
  assert.doesNotMatch(result.stderr, /at .*\(.*:\d+/);
});

test("help identifies the independent package and command", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^lockgrok —/);
  assert.match(result.stdout, /lockgrok --before/);
  assert.doesNotMatch(result.stdout, /diff-package-lock/);
});

test("the executable reports the version of its own package", () => {
  const result = run(["--version"]);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, `${version}\n`);
});

test("parse errors identify the input file and keep stdout empty", async () => {
  const directory = await mkdtemp(path.join(root, ".process-test-"));
  try {
    const filename = path.join(directory, "broken.json");
    await writeFile(filename, "{oops");
    const result = run(["--before", filename, "--after", filename]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.includes("broken.json"));
    assert.match(result.stderr, /Invalid JSON/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("explicit color works when piped, and JSON remains clean", () => {
  const colored = run([...demoArgs, "--color", "always"]);
  assert.equal(colored.status, 0);
  assert.ok(colored.stdout.includes(String.fromCharCode(27)));
  const json = run([...demoArgs, "--color", "always", "--json"]);
  assert.equal(json.status, 0);
  assert.equal(JSON.parse(json.stdout).length, 7);
});
