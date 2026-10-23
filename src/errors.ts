import { Data } from "effect";

export class LockfileError extends Data.TaggedError("LockfileError")<{
  readonly source: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class InputError extends Data.TaggedError("InputError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class SourceError extends Data.TaggedError("SourceError")<{
  readonly source: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type CliError = LockfileError | InputError | SourceError;
