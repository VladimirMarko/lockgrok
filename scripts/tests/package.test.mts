import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";
import { valid } from "semver";

const root = fileURLToPath(new URL("../../", import.meta.url));
const packageSchema = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  bin: Schema.Record(Schema.String, Schema.String),
  license: Schema.String,
  private: Schema.optionalKey(Schema.Boolean),
});

test("the ISC-licensed package has its own identity and permits publication", async () => {
  const json: unknown = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  const metadata = Schema.decodeUnknownSync(packageSchema)(json);
  assert.equal(metadata.name, "lockgrok");
  assert.equal(valid(metadata.version), metadata.version);
  assert.deepEqual(metadata.bin, { lockgrok: "dist/index.js" });
  assert.equal(metadata.license, "ISC");
  assert.equal(metadata.private, undefined);
});

test("a production rebuild removes obsolete compiled modules", async () => {
  const dist = path.join(root, "dist");
  await mkdir(dist, { recursive: true });
  await writeFile(path.join(dist, "obsolete-implementation.js"), "stale build");
  execFileSync(process.execPath, ["--import", "tsx", "scripts/build.mts"], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  const files = await readdir(dist);
  assert.ok(files.includes("api.js"));
  assert.ok(files.includes("api.d.ts"));
  assert.ok(files.includes("index.js"));
  assert.ok(!files.includes("obsolete-implementation.js"));
});

test("production source maps embed the complete TypeScript sources", async () => {
  const dist = path.join(root, "dist");
  const files = await readdir(dist);
  const maps = files.filter((file) => file.endsWith(".js.map"));
  assert.ok(maps.length > 0);
  const sourceMapSchema = Schema.Struct({
    sources: Schema.Array(Schema.String),
    sourcesContent: Schema.Array(Schema.String),
  });
  for (const file of maps) {
    const json: unknown = JSON.parse(
      await readFile(path.join(dist, file), "utf8"),
    );
    const map = Schema.decodeUnknownSync(sourceMapSchema)(json);
    assert.ok(map.sources.length > 0, file);
    const sources = await Promise.all(
      map.sources.map((source) => readFile(path.resolve(dist, source), "utf8")),
    );
    assert.deepEqual(map.sourcesContent, sources, file);
  }
});

test("the package exposes an importable API and hides executable internals", () => {
  for (const source of [
    'const { classifyChange } = require("lockgrok");',
    'import { classifyChange } from "lockgrok";',
  ]) {
    const output = execFileSync(
      process.execPath,
      [
        ...(source.startsWith("import") ? ["--input-type=module"] : []),
        "-e",
        `${source}\nif (classifyChange("1.0.0", "2.0.0").step !== "major") process.exit(1);`,
      ],
      { cwd: root, encoding: "utf8", stdio: "pipe" },
    );
    assert.equal(output, "", "importing the API must not execute the CLI");
  }
  const output = execFileSync(
    process.execPath,
    [
      "-e",
      `const assert = require("node:assert/strict");
       assert.throws(() => require("lockgrok/dist/index.js"),
         { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });`,
    ],
    { cwd: root, encoding: "utf8", stdio: "pipe" },
  );
  assert.equal(output, "");
});

test("an ESM application can import both the parser and Effect", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { parseLockfile } from "lockgrok";
       import { Effect } from "effect";
       const parsed = await Effect.runPromise(parseLockfile(
         '{"lockfileVersion":3,"packages":{}}', "consumer.json"));
       if (parsed.manager !== "npm" || parsed.packages.length !== 0) process.exit(1);`,
    ],
    { cwd: root, encoding: "utf8", stdio: "pipe" },
  );
  assert.equal(output, "");
});

test("a local tarball includes license status and scoped notices without development fixtures", () => {
  const output = execFileSync(
    "npm",
    ["pack", "--dry-run", "--ignore-scripts", "--json"],
    { cwd: root, encoding: "utf8", stdio: "pipe" },
  );
  const json: unknown = JSON.parse(output);
  const packed = Schema.decodeUnknownSync(
    Schema.Array(
      Schema.Struct({
        files: Schema.Array(Schema.Struct({ path: Schema.String })),
      }),
    ),
  )(json);
  assert.equal(packed.length, 1);
  const contents = packed[0];
  assert.ok(contents);
  const files = new Set(contents.files.map((file) => file.path));
  for (const required of [
    "dist/index.js",
    "dist/api.js",
    "LICENSE",
    "LICENSE-STATUS.md",
    "NOTICE.md",
    "third-party-notices/diff-package-lock.txt",
    "README.md",
  ]) {
    assert.ok(files.has(required), `Missing packaged file: ${required}`);
  }
  assert.ok(![...files].some((file) => file.startsWith(".agents/")));
  assert.ok(!files.has("docs/table-preview.svg"));
  assert.deepEqual(
    [...files].filter((file) => file.startsWith("third-party-notices/")),
    ["third-party-notices/diff-package-lock.txt"],
  );
  assert.ok(!files.has("docs/table-preview.png"));
  assert.ok(!files.has("docs/testing.md"));
  for (const file of files) {
    assert.ok(!file.startsWith("examples/"), file);
    assert.ok(!file.startsWith("repos/"), file);
    assert.ok(!file.includes("tests/"), file);
    assert.ok(!file.endsWith(".ttf"), file);
  }
});
