import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import type {
  ChangeSummary,
  DependencyScope,
  DependencyUsage,
  DiffReport,
  DiffRow,
  PackageDetail,
  ReportedChange,
  VersionDetail,
} from "../model.js";
import { renderReport } from "../renderReport.js";
import { renderTable } from "../renderTable.js";

const zero: ChangeSummary = {
  packages: 0,
  changes: 0,
  upgrade: 0,
  downgrade: 0,
  add: 0,
  remove: 0,
  changed: 0,
};

const usage = (
  consumer: string,
  alias = "shared",
  scope: DependencyScope = "direct",
): DependencyUsage => ({
  id: `${consumer}:${alias}`,
  consumerId: consumer,
  consumer,
  alias,
  targetId: `resolved:${alias}`,
  scope,
  projects: ["."],
});

const change = (
  row: DiffRow,
  match: ReportedChange["match"] = "inventory",
): ReportedChange => ({
  row,
  match,
  scope: row.scope ?? "unknown",
  references: [],
});

const version = (
  value: string,
  references: readonly DependencyUsage[] = [],
): VersionDetail => ({ version: value, scope: "unknown", references });

const report = (
  changes: readonly ReportedChange[],
  summary: ChangeSummary,
  packages: readonly PackageDetail[] = [],
): DiffReport => ({ changes, packages, summary, total: summary });

const changes: readonly ReportedChange[] = [
  {
    ...change(
      {
        package: "alpha",
        before: "1.0.0",
        after: "2.0.0",
        direction: "upgrade",
        step: "major",
        context: "apps/web",
      },
      "dependency",
    ),
    references: [
      { before: usage("apps/web"), after: usage("apps/web") },
      { before: usage("apps/site"), after: usage("apps/site") },
    ],
  },
  change({
    package: "alpha",
    before: "2.0.0",
    after: "1.0.0",
    direction: "downgrade",
    step: "major",
    context: "apps/api",
  }),
  change({
    package: "beta",
    before: "1.0.0",
    after: "1.1.0",
    direction: "upgrade",
    step: "minor",
  }),
  change({
    package: "beta",
    before: "2.0.0",
    after: "2.1.0",
    direction: "upgrade",
    step: "minor",
  }),
  change({
    package: "gamma",
    before: null,
    after: "3.0.0",
    direction: "add",
    step: null,
  }),
  change({
    package: "omega",
    before: "4.0.0",
    after: null,
    direction: "remove",
    step: null,
  }),
];

const counts: ChangeSummary = {
  packages: 4,
  changes: 6,
  upgrade: 3,
  downgrade: 1,
  add: 1,
  remove: 1,
  changed: 0,
};

test("reports distinct package and change-row counts without counting consumers as changes", () => {
  const input = report(changes, counts);
  const output = renderReport(input);
  assert.equal(
    output.split("\n").at(-1),
    "4 packages · 6 changes: 3 upgrades, 1 downgrade, 1 add, 1 remove",
  );
  assert.ok(!output.includes("Details"));
  assert.ok(!output.includes("consumers"));
  assert.equal(
    renderReport(input, { summary: false }),
    renderTable(changes.map(({ row }) => row)),
  );
  assert.equal(
    stripVTControlCharacters(renderReport(input, { color: true })),
    output,
  );
});

test("summary grammar handles one unordered change and a genuinely empty diff", () => {
  const input = report(
    [
      change({
        package: "build",
        before: "1.0.0+one",
        after: "1.0.0+two",
        direction: "changed",
        step: "suffix",
      }),
    ],
    { ...zero, packages: 1, changes: 1, changed: 1 },
  );
  assert.equal(
    renderReport(input).split("\n").at(-1),
    "1 package · 1 change: 1 unordered change",
  );
  assert.equal(
    renderReport(report([], zero)),
    "No dependency version changes.\n\n0 packages · 0 changes",
  );
});

test("filtered summaries show selected and total counts, including zero visible changes", () => {
  const first = changes[0];
  assert.ok(first);
  const filtered: DiffReport = {
    ...report([first], { ...zero, packages: 1, changes: 1, upgrade: 1 }),
    total: counts,
  };
  assert.equal(
    renderReport(filtered).split("\n").at(-1),
    "Showing 1 of 4 packages · 1 of 6 changes: 1 upgrade",
  );
  const empty = { ...report([], zero), total: counts };
  assert.equal(
    renderReport(empty),
    "No changes match the selected filters.\n\nShowing 0 of 4 packages · 0 of 6 changes",
  );
  assert.equal(
    renderReport(empty, { summary: false, details: true }),
    "No changes match the selected filters.",
  );
});

test("details expose complete and retained version sets and unpaired inventory evidence", () => {
  const added = change({
    package: "shared",
    before: null,
    after: "3.0.0",
    direction: "add",
    step: null,
  });
  const removed = change({
    package: "shared",
    before: "2.0.0",
    after: null,
    direction: "remove",
    step: null,
  });
  const input = report(
    [added, removed],
    {
      ...zero,
      packages: 1,
      changes: 2,
      add: 1,
      remove: 1,
    },
    [
      {
        package: "shared",
        before: [version("1.0.0", [usage("apps/web")]), version("2.0.0")],
        after: [version("1.0.0", [usage("apps/web")]), version("3.0.0")],
        retained: ["1.0.0"],
        changes: [added, removed],
      },
    ],
  );
  const output = renderReport(input, { details: true });
  for (const text of [
    "Details",
    "Before versions: 1.0.0, 2.0.0",
    "After versions: 1.0.0, 3.0.0",
    "Retained versions: 1.0.0",
    "new version of an existing package",
    "version removed; package remains",
    "Evidence: unpaired inventory entry",
    "apps/web → shared",
    "consumer metadata unavailable",
  ])
    assert.ok(output.includes(text), `Missing ${text}`);
});

test("details distinguish dependency matches, installation matches, and new package inventory", () => {
  const dependency: ReportedChange = {
    ...change(
      {
        package: "shared",
        before: "1.0.0",
        after: "2.0.0",
        direction: "upgrade",
        step: "major",
        context: "apps/web → shared",
      },
      "dependency",
    ),
    references: [{ before: usage("apps/web"), after: usage("apps/web") }],
  };
  const installation = change(
    {
      package: "nested",
      before: "1.0.0",
      after: "1.0.1",
      direction: "upgrade",
      step: "patch",
      context: "node_modules/host/node_modules/nested",
    },
    "installation",
  );
  const added = change({
    package: "new-package",
    before: null,
    after: "1.0.0",
    direction: "add",
    step: null,
  });
  const details: readonly PackageDetail[] = [
    {
      package: "shared",
      before: [version("1.0.0")],
      after: [version("2.0.0")],
      retained: [],
      changes: [dependency],
    },
    {
      package: "nested",
      before: [version("1.0.0")],
      after: [version("1.0.1")],
      retained: [],
      changes: [installation],
    },
    {
      package: "new-package",
      before: [],
      after: [version("1.0.0")],
      retained: [],
      changes: [added],
    },
  ];
  const output = renderReport(
    report(
      [dependency, installation, added],
      {
        ...zero,
        packages: 3,
        changes: 3,
        upgrade: 2,
        add: 1,
      },
      details,
    ),
    { details: true },
  );
  for (const text of [
    "Evidence: matched dependency reference",
    "Evidence: matched installation location",
    "Before consumer: apps/web → shared",
    "After consumer: apps/web → shared",
    "Context: node_modules/host/node_modules/nested",
    "new package",
    "Before versions: none",
  ])
    assert.ok(output.includes(text), `Missing ${text}`);
});

test("the optional Scope column uses the report's classified scope", () => {
  const first = changes[0];
  assert.ok(first);
  const output = renderReport(
    report([{ ...first, scope: "both" }], {
      ...zero,
      packages: 1,
      changes: 1,
      upgrade: 1,
    }),
    { columns: ["package", "scope"], summary: false },
  );
  assert.ok(output.includes("Scope"));
  assert.ok(output.includes("both"));
  assert.ok(!output.includes("unknown"));
  assert.ok(!output.includes("[apps/web]"));
});

test("alias reference changes do not claim retained versions were newly installed or removed", () => {
  const added = change(
    {
      package: "replacement",
      before: null,
      after: "2.0.0",
      direction: "add",
      step: null,
    },
    "dependency",
  );
  const removed = change(
    {
      package: "original",
      before: "1.0.0",
      after: null,
      direction: "remove",
      step: null,
    },
    "dependency",
  );
  const input = report(
    [added, removed],
    {
      ...zero,
      packages: 2,
      changes: 2,
      add: 1,
      remove: 1,
    },
    [
      {
        package: "replacement",
        before: [version("v2.0.0")],
        after: [version("2.0.0")],
        retained: ["2.0.0"],
        changes: [added],
      },
      {
        package: "original",
        before: [version("1.0.0")],
        after: [version("1.0.0")],
        retained: ["1.0.0"],
        changes: [removed],
      },
    ],
  );
  const output = renderReport(input, { details: true });
  assert.ok(output.includes("existing version; reference added"));
  assert.ok(output.includes("version retained; reference removed"));
  assert.ok(!output.includes("new version of an existing package"));
  assert.ok(!output.includes("version removed; package remains"));
});

test("all detail and workspace labels are terminal-safe and wrap without splitting graphemes", () => {
  const reference: DependencyUsage = {
    ...usage("app\nforged\u001b[31m\u202e漢字漢字漢字漢字👩‍💻", "alias\u061c"),
    projects: ["apps/web\tlocal"],
  };
  const entry: ReportedChange = {
    ...change(
      {
        package: "safe\nforged\u001b[2J",
        before: "git:old\r\u001b[2J",
        after:
          "git:new\u001b]8;;https://example.com\u0007click\u001b]8;;\u0007",
        direction: "changed",
        step: "unknown",
        context: "install\nforged\u200e",
      },
      "dependency",
    ),
    references: [{ before: reference, after: reference }],
  };
  assert.ok(entry.row.before !== null && entry.row.after !== null);
  const input: DiffReport = {
    ...report([entry], { ...zero, packages: 1, changes: 1, changed: 1 }, [
      {
        package: entry.row.package,
        before: [version(entry.row.before, [reference])],
        after: [version(entry.row.after, [reference])],
        retained: [],
        changes: [entry],
      },
    ]),
    workspace: "apps/web\nforged\u001b[2J",
  };
  const options = { details: true, context: "always", width: 72 } as const;
  const output = renderReport(input, options);
  assert.equal(output, stripVTControlCharacters(output));
  assert.ok(!/[\u202e\u061c\u200e\r\t]/u.test(output));
  assert.ok(output.includes("\\nforged"));
  assert.ok(output.includes("Workspace: apps/web\\nforged"));
  assert.ok(output.includes("👩‍💻"));
  assert.ok(!output.includes("�"));
  assert.ok(output.split("\n").every((line) => stringWidth(line) <= 72));
  assert.equal(
    stripVTControlCharacters(renderReport(input, { ...options, color: true })),
    output,
  );
});
