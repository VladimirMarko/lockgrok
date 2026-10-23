import { Effect } from "effect";
import { createDiffReport } from "./diffLockfiles.js";
import { type CliError, InputError } from "./errors.js";
import { commandName, version } from "./metadata.js";
import { parseOptions, shouldUseColor } from "./options.js";
import { renderReport } from "./renderReport.js";
import { loadPair } from "./sources.js";

export const usage = `${commandName} — readable npm and pnpm version changes

Usage:
  ${commandName} [from] [to] [directory]
  ${commandName} --before OLD_LOCKFILE --after NEW_LOCKFILE

Git defaults: from=HEAD, to=disk (the working tree). Git refs are read without checkout.
Auto-detects the nearest lockfile in the current directory or repository ancestors.

Options:
  -h, --help             Show this help
  -v, --version          Show version
  --from REF             Starting Git revision (or disk)
  --to REF               Ending Git revision (or disk)
  --cwd DIRECTORY        Project directory
  --lockfile PATH        Explicit lockfile path, relative to the project directory
  --manager npm|pnpm     Select a manager when both lockfiles exist
  --before PATH          Old lockfile, without requiring Git
  --after PATH           New lockfile, without requiring Git
  --columns LIST         Comma-separated columns, in order:
                         package,before,after,direction,step,context,scope
                         Default: first five; Context is automatic for repeated names
  --context MODE         auto (default), always, or never; explicit columns win
  --details              Include complete versions, retained versions, and consumers
  --no-summary           Suppress the human-readable change summary
  --package NAME         Filter an exact package name; repeat to select several
  --scope SCOPE          all (default), direct, transitive, both, or unknown
  --workspace PATH       Limit comparison to one lockfile-relative project (. = root)
  --color MODE           auto (default), always, or never
  --no-color             Disable ANSI colors
  --json                 Emit changes as an array; with --details, emit the full report
  --exit-code            Return 1 for selected changes, 0 for none; errors return 2

Direction: ↑ upgrade · ↓ downgrade · + add · − remove · ~ changed
Step: major · minor · patch · suffix · unknown
Build metadata has no upgrade/downgrade ordering. Full pnpm peer selections are
followed to their dependencies. Integrity, layout, and peer-label-only changes
are not version changes. Missing relationship data retains scope=unknown.
`;

export interface CliEnvironment {
  readonly cwd: string;
  readonly isTTY: boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly width?: number;
}

export interface CliResult {
  readonly stdout: string;
  readonly exitCode: 0 | 1;
}

export const runCli = (
  args: readonly string[],
  environment: CliEnvironment,
): Effect.Effect<CliResult, CliError> =>
  Effect.gen(function* () {
    const options = yield* parseOptions(args);
    if (options.help) return { stdout: usage, exitCode: 0 };
    if (options.version) return { stdout: `${version}\n`, exitCode: 0 };
    const { before, after } = yield* loadPair(options, environment.cwd);
    if (options.workspace !== undefined) {
      const projects = new Set(
        [
          ...(before.graph?.projects ?? []),
          ...(after.graph?.projects ?? []),
        ].map(({ id }) => id),
      );
      if (!projects.has(options.workspace))
        return yield* Effect.fail(
          new InputError({
            message: `Unknown workspace '${options.workspace}'. Available projects: ${[...projects].sort().join(", ") || "none (this lockfile lacks project declarations)"}.`,
          }),
        );
    }
    const report = createDiffReport(before, after, {
      packages: options.packages,
      scope: options.scope,
      ...(options.workspace === undefined
        ? {}
        : { workspace: options.workspace }),
    });
    const output = options.json
      ? JSON.stringify(
          options.details ? report : report.changes.map(({ row }) => row),
          null,
          2,
        )
      : renderReport(report, {
          ...(options.columns === undefined
            ? {}
            : { columns: options.columns }),
          context: options.context,
          details: options.details,
          summary: options.summary,
          color: shouldUseColor(
            options.color,
            environment.isTTY,
            environment.env,
          ),
          ...(environment.width === undefined
            ? {}
            : { width: environment.width }),
        });
    return {
      stdout: `${output}\n`,
      exitCode: options.exitCode && report.changes.length > 0 ? 1 : 0,
    };
  });
