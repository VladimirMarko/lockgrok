import { createRequire } from "node:module";
import { Schema } from "effect";

// Bundled metadata is validated once; help, version, and diagnostics share it.
const require = createRequire(import.meta.url);
const packageJson: unknown = require("../package.json");
export const { name: commandName, version } = Schema.decodeUnknownSync(
  Schema.Struct({ name: Schema.String, version: Schema.String }),
)(packageJson);
