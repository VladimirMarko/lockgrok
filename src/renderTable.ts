import { stripVTControlCharacters } from "node:util";
import Table from "cli-table3";
import pc from "picocolors";
import stringWidth from "string-width";
import type { DiffRow, TableColumn, TableOptions } from "./model.js";

const defaultColumns: readonly TableColumn[] = [
  "package",
  "before",
  "after",
  "direction",
  "step",
];

const headers: Readonly<Record<TableColumn, string>> = {
  package: "Package",
  before: "Before",
  after: "After",
  direction: "Direction",
  step: "Step",
  context: "Context",
  scope: "Scope",
};

export const directionLabels: Readonly<Record<DiffRow["direction"], string>> = {
  upgrade: "↑ upgrade",
  downgrade: "↓ downgrade",
  add: "+ add",
  remove: "− remove",
  changed: "~ changed",
};

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
type Palette = ReturnType<typeof pc.createColors>;

/** Keep values from a lockfile from acting as terminal commands or extra rows. */
export function sanitizeTerminalText(value: string): string {
  return stripVTControlCharacters(value).replace(
    /[\p{Cc}\p{Bidi_Control}\p{Zl}\p{Zp}]/gu,
    (character) => {
      if (character === "\n") return "\\n";
      if (character === "\r") return "\\r";
      if (character === "\t") return "\\t";
      return `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
    },
  );
}

function valuesFor(row: DiffRow): Readonly<Record<TableColumn, string>> {
  return {
    package: sanitizeTerminalText(row.package),
    before: row.before === null ? "—" : sanitizeTerminalText(row.before),
    after: row.after === null ? "—" : sanitizeTerminalText(row.after),
    direction: directionLabels[row.direction],
    step: row.step ?? "—",
    context:
      row.context === undefined ? "—" : sanitizeTerminalText(row.context),
    scope: row.scope ?? "unknown",
  };
}

function stepColor(
  step: DiffRow["step"],
  value: string,
  colors: Palette,
): string {
  switch (step) {
    case "major":
      return colors.magenta(colors.bold(value));
    case "minor":
      return colors.cyan(value);
    case "patch":
      return colors.blue(value);
    case "suffix":
      return colors.yellow(value);
    case "unknown":
    case null:
      return colors.dim(value);
  }
}

function directionColor(
  direction: DiffRow["direction"],
  value: string,
  colors: Palette,
): string {
  switch (direction) {
    case "upgrade":
      return colors.green(value);
    case "downgrade":
      return colors.red(value);
    case "add":
    case "remove":
      return colors.gray(value);
    case "changed":
      return colors.yellow(value);
  }
}

interface WrappedLine {
  readonly text: string;
  readonly offset: number;
}

/** Wrap before applying ANSI styling; cli-table3's hard wrapping counts escapes. */
export function wrapTerminalText(
  value: string,
  width: number,
): readonly WrappedLine[] {
  const lines: WrappedLine[] = [];
  let text = "";
  let offset = 0;
  let visibleWidth = 0;
  for (const { segment, index } of graphemes.segment(value)) {
    const segmentWidth = stringWidth(segment);
    if (text.length > 0 && visibleWidth + segmentWidth > width) {
      lines.push({ text, offset });
      text = "";
      offset = index;
      visibleWidth = 0;
    }
    text += segment;
    visibleWidth += segmentWidth;
  }
  lines.push({ text, offset });
  return lines;
}

function styleLine(
  row: DiffRow,
  column: TableColumn,
  value: string,
  line: WrappedLine,
  colors: Palette,
): string {
  if (column === "package" || column === "context" || column === "scope")
    return line.text;
  if (column === "direction")
    return directionColor(row.direction, line.text, colors);
  if (column === "step") return stepColor(row.step, line.text, colors);
  if (value === "—") return colors.dim(line.text);
  if (row.direction === "add" || row.direction === "remove") {
    return directionColor(row.direction, line.text, colors);
  }
  if (row.step === "unknown") return colors.yellow(line.text);

  // A component range survives wrapping, including a suffix split across lines.
  const match = /^v?(\d+)\.(\d+)\.(\d+)(.*)$/d.exec(value);
  const part = { major: 1, minor: 2, patch: 3, suffix: 4 }[row.step];
  const range = match?.indices?.[part];
  if (!range) return line.text;
  const start = Math.max(0, range[0] - line.offset);
  const end = Math.min(line.text.length, range[1] - line.offset);
  if (start >= end) return line.text;
  return (
    line.text.slice(0, start) +
    stepColor(row.step, line.text.slice(start, end), colors) +
    line.text.slice(end)
  );
}

interface PreparedRow {
  readonly row: DiffRow;
  readonly values: Readonly<Record<TableColumn, string>>;
}

interface ColumnLayout {
  readonly column: TableColumn;
  readonly width: number;
}

function columnLayout(
  columns: readonly TableColumn[],
  rows: readonly PreparedRow[],
  maxWidth: number | undefined,
): readonly ColumnLayout[] {
  const layout = columns.map((column) => {
    const natural = rows.reduce(
      (width, { values }) => Math.max(width, stringWidth(values[column])),
      stringWidth(headers[column]),
    );
    // Keep headings and short semantic labels readable, even in very narrow TTYs.
    const minimum =
      column === "direction" || column === "step"
        ? natural
        : stringWidth(headers[column]);
    return { column, natural, minimum, width: natural };
  });
  if (maxWidth === undefined || !Number.isFinite(maxWidth)) return layout;
  const borderAndPadding = columns.length * 3 + 1;
  const totalExtra = layout.reduce(
    (total, { natural, minimum }) => total + natural - minimum,
    0,
  );
  const budget = Math.max(
    0,
    Math.floor(maxWidth) -
      borderAndPadding -
      layout.reduce((total, { minimum }) => total + minimum, 0),
  );
  if (totalExtra <= budget) return layout;
  for (const column of layout) {
    column.width =
      column.minimum +
      Math.floor(((column.natural - column.minimum) * budget) / totalExtra);
  }
  let remaining =
    budget -
    layout.reduce((total, { width, minimum }) => total + width - minimum, 0);
  for (const column of layout) {
    if (remaining === 0) break;
    if (column.width < column.natural) {
      column.width++;
      remaining--;
    }
  }
  return layout;
}

function selectedColumns(
  rows: readonly DiffRow[],
  options: TableOptions,
): readonly TableColumn[] {
  if (options.columns?.length) return [...new Set(options.columns)];
  const mode = options.context ?? "auto";
  const counts = new Map<string, number>();
  for (const row of rows)
    counts.set(row.package, (counts.get(row.package) ?? 0) + 1);
  const showContext =
    mode === "always" ||
    (mode === "auto" &&
      rows.some(
        (row) =>
          row.context !== undefined && (counts.get(row.package) ?? 0) > 1,
      ));
  return showContext
    ? [
        "package",
        "context",
        ...defaultColumns.filter((column) => column !== "package"),
      ]
    : defaultColumns;
}

/** Render explicit labels and independent direction/step colors in a terminal table. */
export function renderTable(
  rows: readonly DiffRow[],
  options: TableOptions = {},
): string {
  if (rows.length === 0) return "No dependency version changes.";
  const columns = selectedColumns(rows, options);
  const prepared = rows.map((row) => ({ row, values: valuesFor(row) }));
  const layout = columnLayout(columns, prepared, options.width);
  const colors = pc.createColors(options.color ?? false);
  const table = new Table({
    head: layout.map(({ column }) => colors.bold(headers[column])),
    colWidths: layout.map(({ width }) => width + 2),
    wordWrap: false,
    style: { head: [], border: [], compact: true },
  });
  for (const { row, values } of prepared) {
    table.push(
      layout.map(({ column, width }) => {
        const value = values[column];
        return wrapTerminalText(value, width)
          .map((line) => styleLine(row, column, value, line, colors))
          .join("\n");
      }),
    );
  }
  return table.toString();
}
