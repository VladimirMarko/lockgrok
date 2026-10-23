import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { Effect } from "effect";
import { runCli } from "../cli.js";
import { createGitProject } from "./helpers/gitProject.js";
import { expectedRows, scenarioFiles, scenarios } from "./helpers/scenarios.js";

test("fresh Git fixtures ignore inherited configuration, templates, and hooks", async (context) => {
  const ambient = await mkdtemp(path.join(process.cwd(), ".git-ambient-"));
  context.after(() => rm(ambient, { recursive: true, force: true }));
  const templates = path.join(ambient, "templates");
  await mkdir(path.join(templates, "hooks"), { recursive: true });
  await writeFile(
    path.join(templates, "hooks", "pre-commit"),
    "#!/bin/sh\nexit 77\n",
    { mode: 0o755 },
  );
  const globalConfig = path.join(ambient, "gitconfig");
  await writeFile(globalConfig, "this is not valid Git configuration\n");
  const project = await createGitProject(context, {
    ...process.env,
    GIT_DIR: path.join(ambient, "not-a-repository"),
    GIT_WORK_TREE: ambient,
    GIT_TEMPLATE_DIR: templates,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "commit.gpgsign",
    GIT_CONFIG_VALUE_0: "true",
  });
  await project.write("notes.txt", "a fixture owned by this test\n");
  const revision = await project.commit("baseline");
  assert.match(revision, /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/);
  assert.equal((await project.git("branch", "--show-current")).trim(), "main");
  assert.equal(await project.git("status", "--porcelain"), "");
  await assert.rejects(
    readFile(path.join(project.directory, ".git", "hooks", "pre-commit")),
    { code: "ENOENT" },
  );
});

for (const manager of ["npm", "pnpm"] as const) {
  test(`${manager}: fresh Git history agrees with explicit-file scenarios and comparisons preserve the checkout`, async (context) => {
    const scenario = scenarios.find(
      (candidate) => candidate.name === "major-upgrade",
    );
    assert.ok(scenario);
    const inputs = scenarioFiles(scenario, manager);
    const expected = expectedRows(scenario, manager);
    const project = await createGitProject(context);
    const filename = manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml";
    const afterText = await readFile(inputs.after, "utf8");

    await project.write(filename, await readFile(inputs.before, "utf8"));
    const before = await project.commit("initial dependency graph");
    await project.write(filename, afterText);
    const pendingChanges = await project.git("status", "--porcelain");
    const working = await Effect.runPromise(
      runCli(["--json", "--exit-code"], project.environment),
    );
    assert.equal(working.exitCode, 1);
    assert.deepEqual(JSON.parse(working.stdout), expected);
    assert.equal(await project.git("status", "--porcelain"), pendingChanges);
    assert.equal((await project.git("rev-parse", "HEAD")).trim(), before);
    assert.equal(
      (await project.git("branch", "--show-current")).trim(),
      "main",
    );
    assert.equal(
      await readFile(path.join(project.directory, filename), "utf8"),
      afterText,
    );

    const after = await project.commit(
      "upgrade and prune the dependency graph",
    );
    const revisions = await Effect.runPromise(
      runCli([before, after, "--json", "--exit-code"], project.environment),
    );
    assert.equal(revisions.exitCode, 1);
    assert.deepEqual(JSON.parse(revisions.stdout), expected);
    assert.equal((await project.git("rev-parse", "HEAD")).trim(), after);
    assert.equal(
      (await project.git("branch", "--show-current")).trim(),
      "main",
    );
    assert.equal(await project.git("status", "--porcelain"), "");
    assert.equal(
      await readFile(path.join(project.directory, filename), "utf8"),
      afterText,
    );

    await project.write("notes.txt", "an unrelated documentation change\n");
    const unrelated = await project.commit("document the fixture");
    const unchanged = await Effect.runPromise(
      runCli([after, unrelated, "--json", "--exit-code"], project.environment),
    );
    assert.equal(unchanged.exitCode, 0);
    assert.deepEqual(JSON.parse(unchanged.stdout), []);
  });
}
