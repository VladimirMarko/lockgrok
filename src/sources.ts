import { execFile } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Effect } from "effect";
import { type CliError, InputError, SourceError } from "./errors.js";
import type { Lockfile, PackageManager } from "./model.js";
import type { CliOptions } from "./options.js";
import { parseLockfile } from "./parseLockfile.js";

const execute = promisify(execFile);

interface DiskSource {
  readonly kind: "disk";
}
interface GitSource {
  readonly kind: "git";
  readonly commit: string;
  readonly ref: string;
}
type Source = DiskSource | GitSource;

export interface LockfilePair {
  readonly before: Lockfile;
  readonly after: Lockfile;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const git = (cwd: string, args: readonly string[], description: string) =>
  Effect.tryPromise({
    try: async (signal) =>
      (
        await execute("git", ["--literal-pathspecs", ...args], {
          cwd,
          encoding: "utf8",
          maxBuffer: 100 * 1024 * 1024,
          signal,
        })
      ).stdout,
    catch: (cause) =>
      new SourceError({
        source: description,
        message: `${description}: ${messageOf(cause)}`,
        cause,
      }),
  });

const fileStat = (filename: string) =>
  Effect.tryPromise({
    try: async () => {
      try {
        return await stat(filename);
      } catch (cause) {
        if (
          cause instanceof Error &&
          "code" in cause &&
          (cause.code === "ENOENT" || cause.code === "ENOTDIR")
        )
          return undefined;
        throw cause;
      }
    },
    catch: (cause) =>
      new SourceError({
        source: filename,
        message: `Cannot inspect ${filename}: ${messageOf(cause)}`,
        cause,
      }),
  });

const readText = (filename: string) =>
  Effect.tryPromise({
    try: (signal) => readFile(filename, { encoding: "utf8", signal }),
    catch: (cause) =>
      new SourceError({
        source: filename,
        message: `Cannot read ${filename}: ${messageOf(cause)}`,
        cause,
      }),
  });

const resolveSource = (
  ref: string,
  root: string,
): Effect.Effect<Source, SourceError> =>
  ref === "disk"
    ? Effect.succeed({ kind: "disk" })
    : git(
        root,
        ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`],
        `Invalid Git revision '${ref}'`,
      ).pipe(
        Effect.map(
          (commit): Source => ({ kind: "git", ref, commit: commit.trim() }),
        ),
      );

const repositoryPath = (
  root: string,
  filename: string,
): Effect.Effect<string, InputError> => {
  const relative = path.relative(root, filename);
  return relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
    ? Effect.fail(
        new InputError({
          message: `Lockfile must be inside the repository: ${filename}`,
        }),
      )
    : Effect.succeed(relative.split(path.sep).join("/"));
};

const sourceHasFile = (
  source: Source,
  root: string,
  filename: string,
): Effect.Effect<boolean, InputError | SourceError> =>
  source.kind === "disk"
    ? fileStat(filename).pipe(Effect.map((info) => info?.isFile() ?? false))
    : Effect.gen(function* () {
        const relative = yield* repositoryPath(root, filename);
        const names = yield* git(
          root,
          ["ls-tree", "-z", "--name-only", source.commit, "--", relative],
          `Cannot inspect ${source.ref}:${relative}`,
        );
        return names.split("\0").includes(relative);
      });

const readSource = (
  source: Source,
  root: string,
  filename: string,
): Effect.Effect<string, InputError | SourceError> =>
  source.kind === "disk"
    ? readText(filename)
    : Effect.gen(function* () {
        const relative = yield* repositoryPath(root, filename);
        return yield* git(
          root,
          ["show", `${source.commit}:${relative}`],
          `Cannot read ${source.ref}:${relative}`,
        );
      });

const namesFor = (manager: PackageManager | undefined): readonly string[] => {
  if (manager === "pnpm") return ["pnpm-lock.yaml"];
  if (manager === "npm") return ["npm-shrinkwrap.json", "package-lock.json"];
  return ["npm-shrinkwrap.json", "package-lock.json", "pnpm-lock.yaml"];
};

interface LockfilePaths {
  readonly before: string | undefined;
  readonly after: string | undefined;
}

const findLockfiles = (
  directory: string,
  root: string,
  before: Source,
  after: Source,
  options: CliOptions,
): Effect.Effect<LockfilePaths, InputError | SourceError> =>
  Effect.gen(function* () {
    if (options.lockfile !== undefined) {
      const filename = path.resolve(directory, options.lockfile);
      const [hasBefore, hasAfter] = yield* Effect.all(
        [
          sourceHasFile(before, root, filename),
          sourceHasFile(after, root, filename),
        ],
        { concurrency: 2 },
      );
      if (!hasBefore && !hasAfter)
        return yield* Effect.fail(
          new SourceError({
            source: filename,
            message: `Lockfile does not exist in either snapshot: ${filename}`,
          }),
        );
      return {
        before: hasBefore ? filename : undefined,
        after: hasAfter ? filename : undefined,
      };
    }
    let current = directory;
    while (true) {
      const oldFiles: string[] = [];
      const newFiles: string[] = [];
      for (const name of namesFor(options.manager)) {
        const filename = path.join(current, name);
        const [hasBefore, hasAfter] = yield* Effect.all(
          [
            sourceHasFile(before, root, filename),
            sourceHasFile(after, root, filename),
          ],
          { concurrency: 2 },
        );
        if (hasBefore) oldFiles.push(filename);
        if (hasAfter) newFiles.push(filename);
      }
      const available = [...oldFiles, ...newFiles];
      if (available.length) {
        if (
          available.some((filename) => filename.endsWith("pnpm-lock.yaml")) &&
          available.some((filename) => filename.endsWith(".json"))
        ) {
          return yield* Effect.fail(
            new InputError({
              message:
                "Both npm and pnpm lockfiles are present. Select --manager npm|pnpm or --lockfile PATH.",
            }),
          );
        }
        // Match npm's shrinkwrap precedence independently in each snapshot.
        return { before: oldFiles[0], after: newFiles[0] };
      }
      if (current === root || path.dirname(current) === current) break;
      current = path.dirname(current);
    }
    return yield* Effect.fail(
      new SourceError({
        source: directory,
        message: `No npm or pnpm lockfile found in ${directory} or its repository ancestors. Use --lockfile PATH or --before/--after.`,
      }),
    );
  });

/** Read immutable snapshots without checkout, installation, or lockfile writes. */
export const loadPair = (
  options: CliOptions,
  processCwd: string,
): Effect.Effect<LockfilePair, CliError> =>
  Effect.gen(function* () {
    let directory = path.resolve(processCwd, options.cwd ?? ".");
    if (options.before !== undefined && options.after !== undefined) {
      const read = (filename: string) => {
        const absolute = path.resolve(directory, filename);
        return readText(absolute).pipe(
          Effect.flatMap((text) =>
            parseLockfile(text, absolute, options.manager),
          ),
        );
      };
      const [before, after] = yield* Effect.all(
        [read(options.before), read(options.after)],
        { concurrency: 2 },
      );
      return { before, after };
    }

    const positionals = [...options.positionals];
    const last = positionals.at(-1);
    if (last !== undefined) {
      const possibleDirectory = path.resolve(directory, last);
      const info = yield* fileStat(possibleDirectory);
      if (info?.isDirectory()) {
        if (options.cwd !== undefined)
          return yield* Effect.fail(
            new InputError({
              message: "Use either --cwd or a positional directory, not both.",
            }),
          );
        directory = possibleDirectory;
        positionals.pop();
      }
    }
    if (positionals.length > 2)
      return yield* Effect.fail(
        new InputError({
          message:
            "Expected at most two Git refs; the last directory argument must exist.",
        }),
      );
    const info = yield* fileStat(directory);
    if (!info?.isDirectory())
      return yield* Effect.fail(
        new SourceError({
          source: directory,
          message: `Directory does not exist: ${directory}`,
        }),
      );
    directory = yield* Effect.tryPromise({
      try: () => realpath(directory),
      catch: (cause) =>
        new SourceError({
          source: directory,
          message: `Cannot resolve project directory ${directory}: ${messageOf(cause)}`,
          cause,
        }),
    });
    const fromRef = options.from ?? positionals[0] ?? "HEAD";
    const toRef = options.to ?? positionals[1] ?? "disk";
    const needsGit = fromRef !== "disk" || toRef !== "disk";
    const root = needsGit
      ? (yield* git(
          directory,
          ["rev-parse", "--show-toplevel"],
          "Cannot find Git repository (use --before/--after for files)",
        )).trim()
      : directory;
    const [oldSource, newSource] = yield* Effect.all(
      [resolveSource(fromRef, root), resolveSource(toRef, root)],
      { concurrency: 2 },
    );
    const filenames = yield* findLockfiles(
      directory,
      root,
      oldSource,
      newSource,
      options,
    );
    const read = (source: Source, filename: string) =>
      readSource(source, root, filename).pipe(
        Effect.flatMap((text) =>
          parseLockfile(
            text,
            source.kind === "git" ? `${source.ref}:${filename}` : filename,
            options.manager,
          ),
        ),
      );
    const empty = (other: Lockfile): Lockfile => ({
      manager: other.manager,
      lockfileVersion: "absent",
      packages: [],
    });
    if (filenames.before !== undefined && filenames.after !== undefined) {
      const [before, after] = yield* Effect.all(
        [read(oldSource, filenames.before), read(newSource, filenames.after)],
        { concurrency: 2 },
      );
      return { before, after };
    }
    if (filenames.before !== undefined) {
      const before = yield* read(oldSource, filenames.before);
      return { before, after: empty(before) };
    }
    if (filenames.after === undefined)
      return yield* Effect.fail(
        new SourceError({
          source: directory,
          message: "No lockfile exists in either snapshot.",
        }),
      );
    const after = yield* read(newSource, filenames.after);
    return { before: empty(after), after };
  });
