import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { Effect } from "effect";
import { runCli } from "../cli.js";
import { version as packageVersion } from "../metadata.js";

let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(process.cwd(), ".cli-test-"));
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

const lock = (version: string) =>
  JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { name: "root", version: "9.9.9" },
      "node_modules/example": { version },
    },
  });
const environment = () => ({ cwd: directory, isTTY: false, env: {} });
const write = (name: string, contents: string) =>
  fs.writeFile(path.join(directory, name), contents);
function git(...args: string[]): string {
  return execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
async function initRepository() {
  git("init", "-b", "main");
  git("config", "user.name", "Lockfile test");
  git("config", "user.email", "test@example.invalid");
  git("config", "commit.gpgsign", "false");
  await write("package-lock.json", lock("1.2.3"));
  git("add", ".");
  git("commit", "-m", "baseline");
}

test("help and version work without a repository", async () => {
  const help = await Effect.runPromise(runCli(["--help"], environment()));
  assert.equal(help.exitCode, 0);
  assert.match(help.stdout, /--before/);
  assert.match(help.stdout, /pnpm/);
  assert.match(
    help.stdout,
    /Direction: ↑ upgrade · ↓ downgrade · \+ add · − remove · ~ changed/,
  );
  const version = await Effect.runPromise(runCli(["--version"], environment()));
  assert.equal(version.stdout, `${packageVersion}\n`);
});

test("compares explicit files without git, emits a table, and supports exit-code", async () => {
  await write("old.json", lock("2.0.0"));
  await write("new.json", lock("1.9.0"));
  const result = await Effect.runPromise(
    runCli(
      ["--before", "old.json", "--after", "new.json", "--exit-code"],
      environment(),
    ),
  );
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /Package/);
  assert.match(result.stdout, /downgrade/);
  assert.match(result.stdout, /major/);
  assert.equal(result.stdout.includes(String.fromCharCode(27)), false);
});

test("JSON output is one valid array without ANSI or prose", async () => {
  await write("old.json", lock("1.2.3"));
  await write("new.json", lock("1.3.0"));
  const result = await Effect.runPromise(
    runCli(
      [
        "--before",
        "old.json",
        "--after",
        "new.json",
        "--json",
        "--color",
        "always",
      ],
      environment(),
    ),
  );
  assert.deepEqual(JSON.parse(result.stdout), [
    {
      package: "example",
      before: "1.2.3",
      after: "1.3.0",
      direction: "upgrade",
      step: "minor",
    },
  ]);
});

test("JSON output uses add and remove action names", async () => {
  await write(
    "old.json",
    JSON.stringify({
      lockfileVersion: 3,
      packages: { "node_modules/old-package": { version: "1.0.0" } },
    }),
  );
  await write(
    "new.json",
    JSON.stringify({
      lockfileVersion: 3,
      packages: { "node_modules/new-package": { version: "2.0.0" } },
    }),
  );
  const result = await Effect.runPromise(
    runCli(
      ["--before", "old.json", "--after", "new.json", "--json"],
      environment(),
    ),
  );
  assert.deepEqual(JSON.parse(result.stdout), [
    {
      package: "new-package",
      before: null,
      after: "2.0.0",
      direction: "add",
      step: null,
    },
    {
      package: "old-package",
      before: "1.0.0",
      after: null,
      direction: "remove",
      step: null,
    },
  ]);
});

test("equal inventories produce no-change text and zero exit status", async () => {
  await write("old.json", lock("1.2.3"));
  const result = await Effect.runPromise(
    runCli(
      ["--before", "old.json", "--after", "old.json", "--exit-code"],
      environment(),
    ),
  );
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /No dependency version changes/);
});

test("defaults to HEAD versus disk, with two-ref and legacy directory forms", async () => {
  await initRepository();
  await write("package-lock.json", lock("2.0.0"));
  const working = await Effect.runPromise(runCli([], environment()));
  assert.match(working.stdout, /upgrade/);
  git("add", ".");
  git("commit", "-m", "upgrade");
  const refs = await Effect.runPromise(
    runCli(["HEAD~1", "HEAD", directory, "--json"], {
      cwd: process.cwd(),
      isTTY: false,
      env: {},
    }),
  );
  assert.equal(JSON.parse(refs.stdout)[0].step, "major");
});

test("resolves lockfile paths relative to a nested project and repo root", async () => {
  await initRepository();
  await fs.mkdir(path.join(directory, "packages", "app"), { recursive: true });
  await fs.rename(
    path.join(directory, "package-lock.json"),
    path.join(directory, "packages", "app", "package-lock.json"),
  );
  git("add", ".");
  git("commit", "-m", "move to nested project");
  await write("packages/app/package-lock.json", lock("1.2.4"));
  const result = await Effect.runPromise(
    runCli(["--cwd", "packages/app", "--json"], environment()),
  );
  assert.equal(JSON.parse(result.stdout)[0].step, "patch");
  await fs.mkdir(path.join(directory, "packages", "app", "src"));
  const child = await Effect.runPromise(
    runCli(["--cwd", "packages/app/src", "--json"], environment()),
  );
  assert.deepEqual(JSON.parse(child.stdout), JSON.parse(result.stdout));
});

test("auto-detects pnpm and preserves prerelease suffix changes", async () => {
  const pnpm = (version: string) =>
    `lockfileVersion: '9.0'\nimporters:\n  .: {}\npackages:\n  example@${version}: {}\nsnapshots:\n  example@${version}: {}\n`;
  await write("old.yaml", pnpm("1.0.0-beta.2"));
  await write("new.yaml", pnpm("1.0.0-beta.10"));
  const result = await Effect.runPromise(
    runCli(
      ["--before", "old.yaml", "--after", "new.yaml", "--json"],
      environment(),
    ),
  );
  assert.equal(JSON.parse(result.stdout)[0].direction, "upgrade");
  assert.equal(JSON.parse(result.stdout)[0].step, "suffix");
});

test("pnpm git autodetection and manager selection resolve mixed repositories", async () => {
  await initRepository();
  await write(
    "pnpm-lock.yaml",
    "lockfileVersion: '9.0'\npackages:\n  example@2.0.0: {}\n",
  );
  const error = await Effect.runPromise(Effect.flip(runCli([], environment())));
  assert.equal(error._tag, "InputError");
  assert.match(error.message, /--manager|--lockfile/);
  const result = await Effect.runPromise(
    runCli(["--manager", "pnpm", "--json"], environment()),
  );
  assert.equal(JSON.parse(result.stdout)[0].direction, "add");
});

test("a lockfile absent at a valid revision is an empty inventory", async () => {
  await initRepository();
  await fs.rm(path.join(directory, "package-lock.json"));
  const result = await Effect.runPromise(runCli(["--json"], environment()));
  assert.equal(JSON.parse(result.stdout)[0].direction, "remove");
});

test("missing explicit files, malformed files, and invalid refs remain typed errors", async () => {
  const absent = await Effect.runPromise(
    Effect.flip(
      runCli(
        ["--before", "absent.json", "--after", "also-absent.json"],
        environment(),
      ),
    ),
  );
  assert.equal(absent._tag, "SourceError");
  await write("bad.json", "{oops");
  const malformed = await Effect.runPromise(
    Effect.flip(
      runCli(["--before", "bad.json", "--after", "bad.json"], environment()),
    ),
  );
  assert.equal(malformed._tag, "LockfileError");
  await initRepository();
  const invalid = await Effect.runPromise(
    Effect.flip(runCli(["not-a-real-ref"], environment())),
  );
  assert.equal(invalid._tag, "SourceError");
  assert.match(invalid.message, /not-a-real-ref/);
});

test("git filenames with spaces and brackets use literal paths", async () => {
  await initRepository();
  await write("lock [test].json", lock("1.0.0"));
  git("add", ".");
  git("commit", "-m", "special lock path");
  await write("lock [test].json", lock("1.0.1"));
  const result = await Effect.runPromise(
    runCli(["--lockfile", "lock [test].json", "--json"], environment()),
  );
  assert.equal(JSON.parse(result.stdout)[0].step, "patch");
});

test("a symlinked project directory resolves to the same Git lockfile", async () => {
  await initRepository();
  await write("package-lock.json", lock("1.2.4"));
  await fs.symlink(directory, path.join(directory, "via-link"), "junction");
  const result = await Effect.runPromise(
    runCli(["--cwd", "via-link", "--json"], environment()),
  );
  assert.equal(JSON.parse(result.stdout)[0].step, "patch");
});

test("npm shrinkwrap conversion compares the effective filename in each snapshot", async () => {
  await initRepository();
  await fs.rm(path.join(directory, "package-lock.json"));
  await write("npm-shrinkwrap.json", lock("2.0.0"));
  const result = await Effect.runPromise(runCli(["--json"], environment()));
  assert.deepEqual(JSON.parse(result.stdout), [
    {
      package: "example",
      before: "1.2.3",
      after: "2.0.0",
      direction: "upgrade",
      step: "major",
    },
  ]);
  git("add", ".");
  git("commit", "-m", "use shrinkwrap");
  await fs.rm(path.join(directory, "npm-shrinkwrap.json"));
  await write("package-lock.json", lock("1.2.3"));
  const reverse = await Effect.runPromise(runCli(["--json"], environment()));
  assert.equal(JSON.parse(reverse.stdout)[0].direction, "downgrade");
});

test("npm consumer swaps produce a contextual upgrade and downgrade", async () => {
  const input = (rootVersion: string, nestedVersion: string) =>
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { example: rootVersion, parent: "1.0.0" } },
        "node_modules/parent": {
          version: "1.0.0",
          dependencies: { example: nestedVersion },
        },
        "node_modules/example": { version: rootVersion },
        "node_modules/parent/node_modules/example": { version: nestedVersion },
      },
    });
  await write("before.json", input("1.0.0", "2.0.0"));
  await write("after.json", input("2.0.0", "1.0.0"));
  const result = await Effect.runPromise(
    runCli(
      ["--before", "before.json", "--after", "after.json", "--json"],
      environment(),
    ),
  );
  const rows = JSON.parse(result.stdout);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row: { direction: string }) => row.direction),
    ["upgrade", "downgrade"],
  );
  assert.equal(rows[1].context, "parent@1.0.0 → example");
});

test("pnpm stable snapshot edges report swaps with an unchanged version inventory", async () => {
  const input = (left: string, right: string) => `lockfileVersion: '9.0'
packages:
  left@1.0.0: {}
  right@1.0.0: {}
  example@1.0.0: {}
  example@2.0.0: {}
snapshots:
  left@1.0.0:
    dependencies: {example: ${left}}
  right@1.0.0:
    dependencies: {example: ${right}}
  example@1.0.0: {}
  example@2.0.0: {}
`;
  await write("before.yaml", input("1.0.0", "2.0.0"));
  await write("after.yaml", input("2.0.0", "1.0.0"));
  const result = await Effect.runPromise(
    runCli(
      ["--before", "before.yaml", "--after", "after.yaml", "--json"],
      environment(),
    ),
  );
  const rows = JSON.parse(result.stdout);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row: { direction: string }) => row.direction),
    ["upgrade", "downgrade"],
  );
  assert.match(rows[0].context, /left@1\.0\.0/);
  assert.match(rows[1].context, /right@1\.0\.0/);
});

test("reports summaries by default and supports table-only output", async () => {
  await write("old.json", lock("1.0.0"));
  await write("new.json", lock("2.0.0"));
  const args = ["--before", "old.json", "--after", "new.json"];
  const report = await Effect.runPromise(runCli(args, environment()));
  assert.match(report.stdout, /1 package.*1 change/);
  const table = await Effect.runPromise(
    runCli([...args, "--no-summary"], environment()),
  );
  assert.doesNotMatch(table.stdout, /1 package.*1 change/);
  assert.match(table.stdout, /upgrade/);
});

test("filtered JSON retains its row contract and exit-code follows visible changes", async () => {
  await write("old.json", lock("1.0.0"));
  await write("new.json", lock("2.0.0"));
  const args = ["--before", "old.json", "--after", "new.json", "--exit-code"];
  const filtered = await Effect.runPromise(
    runCli([...args, "--package", "missing", "--json"], environment()),
  );
  assert.equal(filtered.exitCode, 0);
  assert.deepEqual(JSON.parse(filtered.stdout), []);
  const detailed = await Effect.runPromise(
    runCli(
      [...args, "--details", "--json", "--color", "always"],
      environment(),
    ),
  );
  const report = JSON.parse(detailed.stdout);
  assert.equal(detailed.exitCode, 1);
  assert.equal(report.summary.packages, 1);
  assert.equal(report.summary.changes, 1);
  assert.equal(report.changes[0].match, "inventory");
  assert.equal(report.changes[0].scope, "unknown");
  assert.deepEqual(
    report.packages[0].before.map(
      (entry: { version: string }) => entry.version,
    ),
    ["1.0.0"],
  );
  assert.equal(detailed.stdout.includes(String.fromCharCode(27)), false);
  const human = await Effect.runPromise(
    runCli([...args, "--package", "missing"], environment()),
  );
  assert.match(human.stdout, /No changes match the selected filters/);
  assert.match(human.stdout, /0 of 1/);
});

test("workspace controls reject unknown projects with available project names", async () => {
  const input = `lockfileVersion: '9.0'\nimporters:\n  .: {}\n  apps/web: {}\n`;
  await write("old.yaml", input);
  const failure = await Effect.runPromise(
    Effect.flip(
      runCli(
        [
          "--before",
          "old.yaml",
          "--after",
          "old.yaml",
          "--workspace",
          "apps/missing",
        ],
        environment(),
      ),
    ),
  );
  assert.equal(failure._tag, "InputError");
  assert.match(failure.message, /apps\/missing/);
  assert.match(failure.message, /apps\/web/);
});

test("context and scope are independent columns with no package-name annotations", async () => {
  const input = (version: string) => `lockfileVersion: '9.0'
importers:
  apps/web:
    dependencies:
      example: {specifier: '*', version: ${version}}
packages:
  example@${version}: {}
snapshots:
  example@${version}: {}
`;
  await write("old.yaml", input("1.0.0"));
  await write("new.yaml", input("2.0.0"));
  const args = [
    "--before",
    "old.yaml",
    "--after",
    "new.yaml",
    "--workspace",
    "./apps/web/",
    "--scope",
    "direct",
  ];
  const detailed = await Effect.runPromise(
    runCli([...args, "--details", "--json"], environment()),
  );
  const report = JSON.parse(detailed.stdout);
  assert.equal(report.workspace, "apps/web");
  assert.equal(report.changes[0].scope, "direct");
  assert.deepEqual(report.changes[0].references[0].after.projects, [
    "apps/web",
  ]);
  const human = await Effect.runPromise(
    runCli(
      [...args, "--columns", "package,context,scope", "--context", "never"],
      environment(),
    ),
  );
  assert.match(human.stdout, /Context/);
  assert.match(human.stdout, /Scope/);
  assert.match(human.stdout, /apps\/web → example/);
  assert.doesNotMatch(human.stdout, /example \[|\(transitive\)/);
});
