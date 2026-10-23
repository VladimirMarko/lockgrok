import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { devNull } from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import { promisify } from "node:util";
import type { CliEnvironment } from "../../cli.js";

const execute = promisify(execFile);

export interface GitProject {
  readonly directory: string;
  readonly environment: CliEnvironment;
  readonly git: (...args: readonly string[]) => Promise<string>;
  readonly write: (name: string, contents: string) => Promise<void>;
  readonly commit: (message: string) => Promise<string>;
}

export const createGitProject = async (
  context: TestContext,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): Promise<GitProject> => {
  const temporary = await mkdtemp(path.join(process.cwd(), ".git-fixture-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, "project");
  const hooks = path.join(temporary, "empty-hooks");
  await Promise.all([
    mkdir(directory, { recursive: true }),
    mkdir(hooks, { recursive: true }),
  ]);

  const env: NodeJS.ProcessEnv = {
    ...Object.fromEntries(
      Object.entries(baseEnvironment).filter(
        ([key]) => !key.startsWith("GIT_"),
      ),
    ),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: devNull,
    GIT_AUTHOR_NAME: "Fixture author",
    GIT_AUTHOR_EMAIL: "fixtures@example.invalid",
    GIT_COMMITTER_NAME: "Fixture author",
    GIT_COMMITTER_EMAIL: "fixtures@example.invalid",
    GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
  };
  const git = async (...args: readonly string[]): Promise<string> => {
    const result = await execute(
      "git",
      [
        "-c",
        `core.hooksPath=${hooks}`,
        "-c",
        "commit.gpgsign=false",
        "-c",
        "core.autocrlf=false",
        ...args,
      ],
      { cwd: directory, env, encoding: "utf8" },
    );
    return result.stdout;
  };
  await git("init", "--template=", "--initial-branch=main");

  return {
    directory,
    environment: { cwd: directory, isTTY: false, env: {} },
    git,
    write: async (name, contents) => {
      const filename = path.join(directory, name);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, contents);
    },
    commit: async (message) => {
      await git("add", "--all");
      await git("commit", "--allow-empty", "-m", message);
      return (await git("rev-parse", "HEAD")).trim();
    },
  };
};
