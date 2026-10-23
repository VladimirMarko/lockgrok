import { classifyChange } from "./classifyChange.js";
import type {
  ChangeSummary,
  DependencyUsage,
  DiffReport,
  DiffRow,
  PackageDetail,
  ReportOptions,
  ReportedChange,
  VersionDetail,
} from "./model.js";
import {
  directionLabels,
  renderTable,
  sanitizeTerminalText,
  wrapTerminalText,
} from "./renderTable.js";

type FormatLine = (value: string, indent?: number) => string;

const counted = (value: number, noun: string): string =>
  `${value} ${noun}${value === 1 ? "" : "s"}`;

function directionCounts(summary: ChangeSummary): string {
  const parts: string[] = [];
  for (const [value, noun] of [
    [summary.upgrade, "upgrade"],
    [summary.downgrade, "downgrade"],
    [summary.add, "add"],
    [summary.remove, "remove"],
    [summary.changed, "unordered change"],
  ] as const) {
    if (value > 0) parts.push(counted(value, noun));
  }
  return parts.length ? `: ${parts.join(", ")}` : "";
}

function summaryText({ summary, total }: DiffReport): string {
  const filtered =
    summary.packages !== total.packages || summary.changes !== total.changes;
  const counts = filtered
    ? `Showing ${summary.packages} of ${counted(total.packages, "package")} · ${summary.changes} of ${counted(total.changes, "change")}`
    : `${counted(summary.packages, "package")} · ${counted(summary.changes, "change")}`;
  return counts + directionCounts(summary);
}

const versionList = (versions: readonly string[]): string =>
  versions.length ? versions.join(", ") : "none";

const usageText = (usage: DependencyUsage): string =>
  `${usage.consumer} → ${usage.alias} [scope: ${usage.scope}; projects: ${usage.projects.length ? usage.projects.join(", ") : "unknown"}]`;

function consumers(
  side: "before" | "after",
  versions: readonly VersionDetail[],
  line: FormatLine,
): string[] {
  const lines = [line(`Consumers ${side}:`, 2)];
  if (versions.length === 0) lines.push(line("none", 4));
  for (const entry of versions) {
    if (entry.references.length === 0) {
      lines.push(
        line(
          `${entry.version}: consumer metadata unavailable (scope: ${entry.scope})`,
          4,
        ),
      );
    } else {
      for (const reference of entry.references)
        lines.push(line(`${entry.version}: ${usageText(reference)}`, 4));
    }
  }
  return lines;
}

const containsVersion = (
  versions: readonly VersionDetail[],
  version: string,
): boolean =>
  versions.some(
    (entry) => classifyChange(entry.version, version).direction === "unchanged",
  );

function changeText(row: DiffRow, detail: PackageDetail): string {
  const label = directionLabels[row.direction];
  if (row.direction === "add") {
    const meaning =
      detail.before.length === 0
        ? "new package in the selected inventory"
        : containsVersion(detail.before, row.after)
          ? "existing version; reference added"
          : "new version of an existing package";
    return `${label} ${row.after} — ${meaning}`;
  }
  if (row.direction === "remove") {
    const meaning =
      detail.after.length === 0
        ? "package no longer in the selected inventory"
        : containsVersion(detail.after, row.before)
          ? "version retained; reference removed"
          : "version removed; package remains";
    return `${label} ${row.before} — ${meaning}`;
  }
  return `${label} ${row.before} → ${row.after} (${row.step})`;
}

function evidenceText(change: ReportedChange): string {
  switch (change.match) {
    case "dependency":
      return "matched dependency reference";
    case "installation":
      return "matched installation location";
    case "inventory":
      return change.row.direction === "add" || change.row.direction === "remove"
        ? "unpaired inventory entry"
        : "version inventory; single unmatched old/new version pair";
  }
}

function packageDetails(detail: PackageDetail, line: FormatLine): string {
  const lines = [
    line(detail.package),
    line(
      `Before versions: ${versionList(detail.before.map(({ version }) => version))}`,
      2,
    ),
    line(
      `After versions: ${versionList(detail.after.map(({ version }) => version))}`,
      2,
    ),
    line(`Retained versions: ${versionList(detail.retained)}`, 2),
    line("Changes:", 2),
  ];
  for (const change of detail.changes) {
    lines.push(line(changeText(change.row, detail), 4));
    lines.push(line(`Evidence: ${evidenceText(change)}`, 6));
    if (change.row.context !== undefined)
      lines.push(line(`Context: ${change.row.context}`, 6));
    for (const reference of change.references) {
      if (reference.before)
        lines.push(line(`Before consumer: ${usageText(reference.before)}`, 6));
      if (reference.after)
        lines.push(line(`After consumer: ${usageText(reference.after)}`, 6));
    }
  }
  lines.push(...consumers("before", detail.before, line));
  lines.push(...consumers("after", detail.after, line));
  return lines.join("\n");
}

/** Present change rows, selected/total counts, and optional inventory evidence. */
export function renderReport(
  report: DiffReport,
  options: ReportOptions = {},
): string {
  const width =
    options.width !== undefined && Number.isFinite(options.width)
      ? Math.max(1, Math.floor(options.width))
      : Number.POSITIVE_INFINITY;
  const line: FormatLine = (value, indent = 0) => {
    const padding = " ".repeat(indent);
    return wrapTerminalText(
      sanitizeTerminalText(value),
      Math.max(1, width - indent),
    )
      .map(({ text }) => padding + text)
      .join("\n");
  };
  const rows = report.changes.map(({ row, scope }) => ({ ...row, scope }));
  const sections = [
    rows.length === 0 && report.total.changes > 0
      ? line("No changes match the selected filters.")
      : renderTable(rows, options),
  ];
  if (options.summary ?? true) {
    const summary = [line(summaryText(report))];
    if (report.workspace !== undefined)
      summary.unshift(line(`Workspace: ${report.workspace}`));
    sections.push(summary.join("\n"));
  }
  if (options.details && report.packages.length > 0) {
    sections.push(
      [
        line("Details"),
        ...report.packages.map((detail) => packageDetails(detail, line)),
      ].join("\n\n"),
    );
  }
  return sections.join("\n\n");
}
