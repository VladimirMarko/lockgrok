import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Effect } from "effect";
import {
  PreviewError,
  checkPreviews,
  generatePreviews,
  writePreviews,
} from "./preview-artifacts.mjs";

const program = Effect.gen(function* () {
  const { values } = yield* Effect.try({
    try: () =>
      parseArgs({
        args: process.argv.slice(2),
        options: { check: { type: "boolean", default: false } },
        strict: true,
        allowPositionals: false,
      }),
    catch: (cause) =>
      new PreviewError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });
  const previews = yield* generatePreviews();
  const directory = fileURLToPath(new URL("../docs/", import.meta.url));
  yield* values.check
    ? checkPreviews(directory, previews)
    : writePreviews(directory, previews);
  yield* Effect.sync(() => {
    process.stdout.write(
      `${values.check ? "Verified current" : "Generated"} docs/table-preview.svg and docs/table-preview.png (${previews.width} × ${previews.height}). Same ${previews.changes} changes for npm and pnpm.\n`,
    );
  });
});

await Effect.runPromise(
  program.pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
      }),
    ),
  ),
);
