import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Effect } from "effect";
import {
  type Lockfile,
  type PackageManager,
  diffLockfiles,
  parseLockfile,
} from "../api.js";
import { runCli } from "../cli.js";
import {
  type Scenario,
  expectedRows,
  scenarioFiles,
  scenarios,
} from "./helpers/scenarios.js";

interface ScenarioPair {
  readonly manager: PackageManager;
  readonly before: Lockfile;
  readonly after: Lockfile;
  readonly files: { readonly before: string; readonly after: string };
}

async function readScenario(
  scenario: Scenario,
  manager: PackageManager,
): Promise<ScenarioPair> {
  const files = scenarioFiles(scenario, manager);
  const [beforeText, afterText] = await Promise.all([
    readFile(files.before, "utf8"),
    readFile(files.after, "utf8"),
  ]);
  const [before, after] = await Effect.runPromise(
    Effect.all([
      parseLockfile(beforeText, files.before),
      parseLockfile(afterText, files.after),
    ]),
  );
  return { manager, before, after, files };
}

for (const scenario of scenarios) {
  test(`${scenario.name}: ${scenario.description}`, async (t) => {
    const [npm, pnpm] = await Promise.all([
      readScenario(scenario, "npm"),
      readScenario(scenario, "pnpm"),
    ]);

    for (const pair of [npm, pnpm]) {
      await t.test(
        `${pair.manager}: public API and file CLI agree`,
        async () => {
          const expected = expectedRows(scenario, pair.manager);
          const version = pair.manager === "npm" ? "3" : "9.0";
          assert.equal(pair.before.manager, pair.manager);
          assert.equal(pair.after.manager, pair.manager);
          assert.equal(pair.before.lockfileVersion, version);
          assert.equal(pair.after.lockfileVersion, version);
          assert.deepEqual(pair.before.packages, scenario.inventory.before);
          assert.deepEqual(pair.after.packages, scenario.inventory.after);
          assert.deepEqual(diffLockfiles(pair.before, pair.after), expected);

          const cli = await Effect.runPromise(
            runCli(
              [
                "--before",
                pair.files.before,
                "--after",
                pair.files.after,
                "--json",
                "--exit-code",
              ],
              { cwd: process.cwd(), isTTY: false, env: {} },
            ),
          );
          assert.equal(cli.stdout, `${JSON.stringify(expected, null, 2)}\n`);
          assert.equal(cli.exitCode, expected.length === 0 ? 0 : 1);
        },
      );
    }

    await t.test("npm and pnpm describe the same package inventory", () => {
      assert.deepEqual(npm.before.packages, pnpm.before.packages);
      assert.deepEqual(npm.after.packages, pnpm.after.packages);
    });
  });
}
