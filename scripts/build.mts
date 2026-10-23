import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Data, Effect } from "effect";

class BuildError extends Data.TaggedError("BuildError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const execute = promisify(execFile);
const messageOf = (cause: unknown): string => {
  if (!(cause instanceof Error)) return String(cause);
  // tsc writes its diagnostics to stdout, which execFile's message omits.
  const diagnostics =
    "stdout" in cause && typeof cause.stdout === "string" ? cause.stdout : "";
  return `${cause.message}${diagnostics ? `\n${diagnostics}` : ""}`;
};

const build = Effect.gen(function* () {
  yield* Effect.tryPromise({
    try: () => rm(path.join(root, "dist"), { recursive: true, force: true }),
    catch: (cause) =>
      new BuildError({
        message: `Cannot clean the output directory: ${messageOf(cause)}`,
        cause,
      }),
  });
  const compiler = yield* Effect.try({
    try: () => require.resolve("typescript/bin/tsc"),
    catch: (cause) =>
      new BuildError({ message: "TypeScript is missing. Run npm ci.", cause }),
  });
  const result = yield* Effect.tryPromise({
    try: (signal) =>
      execute(process.execPath, [compiler, "-p", "src/tsconfig.json"], {
        cwd: root,
        encoding: "utf8",
        signal,
      }),
    catch: (cause) =>
      new BuildError({
        message: `Compilation failed: ${messageOf(cause)}`,
        cause,
      }),
  });
  yield* Effect.sync(() => {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  });
});

await Effect.runPromise(
  build.pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
      }),
    ),
  ),
);
