import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { Resvg } from "@resvg/resvg-js";
import { Data, Effect, Schema } from "effect";
import { runCli } from "../src/cli.js";
import { commandName } from "../src/metadata.js";
import { renderPreviewSvg } from "./preview-svg.mjs";

export class PreviewError extends Data.TaggedError("PreviewError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface GeneratedPreviews {
  readonly svg: string;
  readonly png: Buffer;
  readonly width: number;
  readonly height: number;
  readonly changes: number;
}

const root = fileURLToPath(new URL("../", import.meta.url));
const changeSchema = Schema.Array(
  Schema.Struct({
    direction: Schema.String,
    step: Schema.NullOr(Schema.String),
  }),
);
const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const exampleCli = (manager: "npm" | "pnpm", flags: readonly string[]) => {
  const extension = manager === "npm" ? "json" : "yaml";
  return runCli(
    [
      "--before",
      `examples/${manager}-before.${extension}`,
      "--after",
      `examples/${manager}-after.${extension}`,
      ...flags,
    ],
    { cwd: root, isTTY: false, env: {} },
  ).pipe(
    Effect.mapError(
      (cause) =>
        new PreviewError({
          message: `Cannot render ${manager} example: ${cause.message}`,
          cause,
        }),
    ),
  );
};

/** Generate both formats in memory from the actual CLI and fixed example files. */
export const generatePreviews = (): Effect.Effect<
  GeneratedPreviews,
  PreviewError
> =>
  Effect.gen(function* () {
    const { colored, pnpm, plain, json } = yield* Effect.all(
      {
        colored: exampleCli("npm", ["--color", "always"]),
        pnpm: exampleCli("pnpm", ["--color", "always"]),
        plain: exampleCli("npm", ["--color", "never"]),
        json: exampleCli("npm", ["--json"]),
      },
      { concurrency: "unbounded" },
    );
    return yield* Effect.try({
      try: () => {
        assert.equal(pnpm.stdout, colored.stdout, "npm/pnpm previews differ");
        assert.equal(plain.stdout, stripVTControlCharacters(colored.stdout));
        const parsed: unknown = JSON.parse(json.stdout);
        const changes = Schema.decodeUnknownSync(changeSchema)(parsed);
        assert.deepEqual(
          changes.map(({ direction, step }) => [direction, step]),
          [
            ["upgrade", "major"],
            ["changed", "suffix"],
            ["add", null],
            ["downgrade", "minor"],
            ["upgrade", "patch"],
            ["remove", null],
            ["upgrade", "suffix"],
          ],
          "Preview fixtures must cover all seven example changes",
        );
        const { svg, width, height } = renderPreviewSvg(
          colored.stdout,
          commandName,
        );
        const png = new Resvg(svg, {
          fitTo: { mode: "original" },
          font: {
            loadSystemFonts: false,
            fontFiles: [
              fileURLToPath(
                new URL(
                  "../examples/fonts/DejaVuSansMono.ttf",
                  import.meta.url,
                ),
              ),
              fileURLToPath(
                new URL(
                  "../examples/fonts/DejaVuSansMono-Bold.ttf",
                  import.meta.url,
                ),
              ),
            ],
            defaultFontFamily: "DejaVu Sans Mono",
            sansSerifFamily: "DejaVu Sans Mono",
            monospaceFamily: "DejaVu Sans Mono",
          },
        })
          .render()
          .asPng();
        return { svg, png, width, height, changes: changes.length };
      },
      catch: (cause) =>
        new PreviewError({
          message: `Preview generation failed: ${messageOf(cause)}`,
          cause,
        }),
    });
  });

const previewFiles = (previews: GeneratedPreviews) => [
  { filename: "table-preview.svg", bytes: Buffer.from(previews.svg) },
  { filename: "table-preview.png", bytes: previews.png },
];

export const writePreviews = (
  directory: string,
  previews: GeneratedPreviews,
): Effect.Effect<void, PreviewError> =>
  Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () => mkdir(directory, { recursive: true }),
      catch: (cause) =>
        new PreviewError({
          message: `Cannot create ${directory}: ${messageOf(cause)}`,
          cause,
        }),
    });
    for (const { filename, bytes } of previewFiles(previews)) {
      yield* Effect.tryPromise({
        try: () => writeFile(path.join(directory, filename), bytes),
        catch: (cause) =>
          new PreviewError({
            message: `Cannot write ${filename}: ${messageOf(cause)}`,
            cause,
          }),
      });
    }
  });

/** Compare exact bytes without writing or repairing checked-in artifacts. */
export const checkPreviews = (
  directory: string,
  previews: GeneratedPreviews,
): Effect.Effect<void, PreviewError> =>
  Effect.gen(function* () {
    for (const { filename, bytes } of previewFiles(previews)) {
      const actual = yield* Effect.tryPromise({
        try: () => readFile(path.join(directory, filename)),
        catch: (cause) =>
          new PreviewError({
            message: `Cannot read ${filename}: ${messageOf(cause)}. Run npm run preview to regenerate both images.`,
            cause,
          }),
      });
      if (!actual.equals(bytes)) {
        return yield* Effect.fail(
          new PreviewError({
            message: `${filename} is stale. Run npm run preview to regenerate both images.`,
          }),
        );
      }
    }
  });
