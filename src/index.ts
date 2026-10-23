#!/usr/bin/env node
import { stripVTControlCharacters } from "node:util";
import { Effect } from "effect";
import { runCli } from "./cli.js";
import { commandName } from "./metadata.js";

const safeMessage = (message: string): string =>
  stripVTControlCharacters(message).replace(
    /[\p{Cc}\p{Bidi_Control}\p{Zl}\p{Zp}]/gu,
    " ",
  );

// A closed pipe is normal when the output is piped to head or another consumer.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exitCode = 0;
  else {
    process.stderr.write(`${commandName}: ${safeMessage(error.message)}\n`);
    process.exitCode = 2;
  }
});

const program = runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  isTTY: process.stdout.isTTY ?? false,
  env: process.env,
  width: process.stdout.columns,
}).pipe(
  Effect.map((result) => {
    process.stdout.write(result.stdout);
    process.exitCode = result.exitCode;
  }),
  Effect.catch((error) =>
    Effect.sync(() => {
      const message =
        error._tag === "LockfileError"
          ? `${error.source}: ${error.message}`
          : error.message;
      process.stderr.write(`${commandName}: ${safeMessage(message)}\n`);
      process.exitCode = 2;
    }),
  ),
);

Effect.runPromise(program).catch((error: unknown) => {
  process.stderr.write(
    `${commandName}: ${safeMessage(error instanceof Error ? error.message : String(error))}\n`,
  );
  process.exitCode = 2;
});
