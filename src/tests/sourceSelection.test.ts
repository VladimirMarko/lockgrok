import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { Effect } from "effect";
import { parseOptions } from "../options.js";
import { loadPair } from "../sources.js";

const lock = (version: string): string =>
  JSON.stringify({
    lockfileVersion: 3,
    packages: { "node_modules/example": { version } },
  });

const scenarios: readonly {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
  readonly version: string;
}[] = [
  {
    name: "uses package-lock.json when it is the only npm lockfile",
    files: { "package-lock.json": lock("1.0.0") },
    version: "1.0.0",
  },
  {
    name: "uses npm-shrinkwrap.json when it is the only npm lockfile",
    files: { "npm-shrinkwrap.json": lock("2.0.0") },
    version: "2.0.0",
  },
  {
    name: "gives npm-shrinkwrap.json precedence when both npm lockfiles exist",
    files: {
      "package-lock.json": lock("1.0.0"),
      "npm-shrinkwrap.json": lock("2.0.0"),
    },
    version: "2.0.0",
  },
];

for (const scenario of scenarios) {
  test(scenario.name, async (context) => {
    // Each test owns one ordinary directory and always removes only that directory.
    const directory = await mkdtemp(path.join(process.cwd(), ".source-test-"));
    context.after(() => rm(directory, { recursive: true, force: true }));
    await Promise.all(
      Object.entries(scenario.files).map(([name, text]) =>
        writeFile(path.join(directory, name), text),
      ),
    );
    const pair = await Effect.runPromise(
      parseOptions(["--from", "disk", "--to", "disk"]).pipe(
        Effect.flatMap((options) => loadPair(options, directory)),
      ),
    );
    assert.deepEqual(pair.before.packages, [
      { name: "example", version: scenario.version },
    ]);
    assert.deepEqual(pair.after, pair.before);
  });
}
