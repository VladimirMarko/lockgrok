import path from "node:path";
import { parseArgs } from "node:util";
import { Effect } from "effect";
import { InputError } from "./errors.js";
import type {
  ContextMode,
  PackageManager,
  ScopeFilter,
  TableColumn,
} from "./model.js";

export type ColorMode = "auto" | "always" | "never";

export interface CliOptions {
  readonly help: boolean;
  readonly version: boolean;
  readonly json: boolean;
  readonly exitCode: boolean;
  readonly color: ColorMode;
  readonly columns: readonly TableColumn[] | undefined;
  readonly context: ContextMode;
  readonly details: boolean;
  readonly summary: boolean;
  readonly scope: ScopeFilter;
  readonly workspace: string | undefined;
  readonly packages: readonly string[];
  readonly positionals: readonly string[];
  readonly cwd: string | undefined;
  readonly from: string | undefined;
  readonly to: string | undefined;
  readonly before: string | undefined;
  readonly after: string | undefined;
  readonly lockfile: string | undefined;
  readonly manager: PackageManager | undefined;
}

const isColumn = (value: string): value is TableColumn =>
  value === "package" ||
  value === "before" ||
  value === "after" ||
  value === "direction" ||
  value === "step" ||
  value === "context" ||
  value === "scope";

export const parseOptions = (
  args: readonly string[],
): Effect.Effect<CliOptions, InputError> =>
  Effect.try({
    try: (): CliOptions => {
      const { values, positionals } = parseArgs({
        args: [...args],
        allowPositionals: true,
        strict: true,
        options: {
          help: { type: "boolean", short: "h" },
          version: { type: "boolean", short: "v" },
          json: { type: "boolean" },
          "exit-code": { type: "boolean" },
          color: { type: "string", default: "auto" },
          "no-color": { type: "boolean" },
          columns: { type: "string" },
          context: { type: "string", default: "auto" },
          details: { type: "boolean" },
          "no-summary": { type: "boolean" },
          scope: { type: "string", default: "all" },
          workspace: { type: "string" },
          package: { type: "string", multiple: true },
          cwd: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          before: { type: "string" },
          after: { type: "string" },
          lockfile: { type: "string" },
          manager: { type: "string" },
        },
      });
      function invalid(message: string): never {
        throw new InputError({ message });
      }
      const color = values["no-color"] ? "never" : values.color;
      if (color !== "auto" && color !== "always" && color !== "never") {
        invalid("--color must be auto, always, or never.");
      }
      if (
        values.manager !== undefined &&
        values.manager !== "npm" &&
        values.manager !== "pnpm"
      ) {
        invalid("--manager must be npm or pnpm.");
      }
      const context = values.context;
      if (context !== "auto" && context !== "always" && context !== "never")
        invalid("--context must be auto, always, or never.");
      const scope = values.scope;
      if (
        scope !== "all" &&
        scope !== "direct" &&
        scope !== "transitive" &&
        scope !== "both" &&
        scope !== "unknown"
      )
        invalid("--scope must be all, direct, transitive, both, or unknown.");
      const columns: TableColumn[] | undefined =
        values.columns === undefined ? undefined : [];
      for (const column of values.columns
        ?.split(",")
        .map((value) => value.trim()) ?? []) {
        if (!isColumn(column))
          invalid(
            `Unknown column '${column}'. Choose package, before, after, direction, step, context, scope.`,
          );
        if (columns?.includes(column))
          invalid(`Column '${column}' is repeated.`);
        columns?.push(column);
      }
      for (const key of [
        "cwd",
        "from",
        "to",
        "before",
        "after",
        "lockfile",
        "workspace",
      ] as const) {
        if (values[key] !== undefined && values[key].length === 0)
          invalid(`--${key} must not be empty.`);
      }
      const workspace =
        values.workspace === undefined
          ? undefined
          : path.posix
              .normalize(values.workspace.replaceAll("\\", "/"))
              .replace(/\/$/, "");
      if (
        workspace !== undefined &&
        (workspace.startsWith("/") ||
          workspace === ".." ||
          workspace.startsWith("../") ||
          /^[a-z]:/i.test(workspace))
      )
        invalid(
          "--workspace must be a lockfile-relative project path (or . for the root).",
        );
      const packages = [...new Set(values.package ?? [])];
      if (packages.some((name) => name.trim().length === 0))
        invalid("--package must not be empty.");
      if ((values.before === undefined) !== (values.after === undefined)) {
        invalid("File comparison requires both --before and --after.");
      }
      if (
        values.before !== undefined &&
        (positionals.length ||
          values.from !== undefined ||
          values.to !== undefined ||
          values.lockfile !== undefined)
      ) {
        invalid(
          "--before/--after cannot be combined with Git refs or --lockfile.",
        );
      }
      if (
        positionals.length &&
        (values.from !== undefined || values.to !== undefined)
      ) {
        invalid(
          "Use either positional Git refs or --from/--to; use --cwd for the directory.",
        );
      }
      if (positionals.length > 3)
        invalid("Expected at most two Git refs and a directory.");
      return {
        help: values.help ?? false,
        version: values.version ?? false,
        json: values.json ?? false,
        exitCode: values["exit-code"] ?? false,
        color,
        columns,
        context,
        details: values.details ?? false,
        summary: !values["no-summary"],
        scope,
        workspace,
        packages,
        positionals,
        cwd: values.cwd,
        from: values.from,
        to: values.to,
        before: values.before,
        after: values.after,
        lockfile: values.lockfile,
        manager: values.manager,
      };
    },
    catch: (cause) =>
      cause instanceof InputError
        ? cause
        : new InputError({
            message:
              cause instanceof Error
                ? cause.message
                : "Unable to parse command-line options.",
            cause,
          }),
  });

/** Explicit CLI flags override the environment; NO_COLOR wins in auto mode. */
export const shouldUseColor = (
  mode: ColorMode,
  isTTY: boolean,
  env: Readonly<Record<string, string | undefined>>,
): boolean => {
  if (mode === "always") return true;
  if (mode === "never" || (env.NO_COLOR !== undefined && env.NO_COLOR !== ""))
    return false;
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== "0";
  return isTTY && env.TERM !== "dumb";
};
