import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import type { DiffRow } from "../model.js";
import { renderTable } from "../renderTable.js";

const rows: readonly DiffRow[] = [
  {
    package: "major-up",
    before: "1.2.3",
    after: "2.0.0",
    direction: "upgrade",
    step: "major",
  },
  {
    package: "minor-down",
    before: "2.5.0",
    after: "2.4.0",
    direction: "downgrade",
    step: "minor",
  },
  {
    package: "patch-up",
    before: "1.0.0",
    after: "1.0.1",
    direction: "upgrade",
    step: "patch",
  },
  {
    package: "prerelease",
    before: "1.0.0-beta.1",
    after: "1.0.0-beta.2",
    direction: "upgrade",
    step: "suffix",
  },
  {
    package: "build",
    before: "1.0.0+one",
    after: "1.0.0+two",
    direction: "changed",
    step: "suffix",
  },
  {
    package: "source",
    before: "link:../one",
    after: "link:../two",
    direction: "changed",
    step: "unknown",
  },
  {
    package: "new",
    before: null,
    after: "3.0.0",
    direction: "add",
    step: null,
  },
  {
    package: "gone",
    before: "4.0.0",
    after: null,
    direction: "remove",
    step: null,
  },
];

function bodyColumn(table: string, index: number): string {
  return table
    .split("\n")
    .filter((line) => line.startsWith("│"))
    .slice(1)
    .map((line) => {
      const cell = line.split("│")[index + 1];
      assert.ok(cell !== undefined, `Missing table column ${index}`);
      return cell.trim();
    })
    .join("");
}

test("renders five labeled columns and explicit direction and semver step", () => {
  const table = renderTable(rows);
  for (const label of [
    "Package",
    "Before",
    "After",
    "Direction",
    "Step",
    "↑ upgrade",
    "↓ downgrade",
    "+ add",
    "− remove",
    "~ changed",
    "major",
    "minor",
    "patch",
    "suffix",
    "unknown",
  ]) {
    assert.ok(table.includes(label), `missing ${label}`);
  }
  for (const row of rows) {
    assert.ok(table.includes(row.package));
    if (row.before) assert.ok(table.includes(row.before));
    if (row.after) assert.ok(table.includes(row.after));
  }
  assert.equal(table, stripVTControlCharacters(table));
  assert.equal(new Set(table.split("\n").map((line) => line.length)).size, 1);
});

test("colors preserve the plain table and use distinct semantic colors", () => {
  const colored = renderTable(rows, { color: true });
  assert.equal(stripVTControlCharacters(colored), renderTable(rows));
  for (const code of [
    "\u001b[32m",
    "\u001b[31m",
    "\u001b[35m",
    "\u001b[36m",
    "\u001b[34m",
    "\u001b[33m",
  ]) {
    assert.ok(
      colored.includes(code),
      `missing ANSI color ${JSON.stringify(code)}`,
    );
  }
  assert.ok(colored.includes("\u001b[35m\u001b[1m2"));
  for (const span of [
    "\u001b[32m↑ upgrade\u001b[39m",
    "\u001b[31m↓ downgrade\u001b[39m",
    "\u001b[35m\u001b[1mmajor\u001b[22m\u001b[39m",
    "\u001b[36mminor\u001b[39m",
    "\u001b[34mpatch\u001b[39m",
    "\u001b[33msuffix\u001b[39m",
  ]) {
    assert.ok(
      colored.includes(span),
      `missing complete color span ${JSON.stringify(span)}`,
    );
  }
});

const inventoryCases: readonly {
  readonly row: DiffRow;
  readonly label: string;
  readonly version: string;
  readonly versionColumn: number;
}[] = [
  {
    row: {
      package: "new",
      before: null,
      after: "3.0.0",
      direction: "add",
      step: null,
    },
    label: "+ add",
    version: "3.0.0",
    versionColumn: 2,
  },
  {
    row: {
      package: "gone",
      before: "4.0.0",
      after: null,
      direction: "remove",
      step: null,
    },
    label: "− remove",
    version: "4.0.0",
    versionColumn: 1,
  },
];

for (const { row, label, version, versionColumn } of inventoryCases) {
  test(`${label} uses plain gray for its complete label and version`, () => {
    const table = renderTable([row], { color: true });
    const body = table
      .split("\n")
      .filter((line) => line.startsWith("│"))
      .at(-1);
    assert.ok(body);
    const cells = body
      .split("│")
      .slice(1, -1)
      .map((cell) => cell.trim());
    assert.equal(cells[versionColumn], `\u001b[90m${version}\u001b[39m`);
    assert.equal(cells[3], `\u001b[90m${label}\u001b[39m`);
    assert.ok(!table.includes("\u001b[32m"));
    assert.ok(!table.includes("\u001b[31m"));

    const plain = renderTable([row], { color: false });
    assert.equal(plain, stripVTControlCharacters(plain));
    assert.equal(stripVTControlCharacters(table), plain);
    assert.equal(bodyColumn(plain, 3), label);
    assert.equal(bodyColumn(plain, versionColumn), version);
  });
}

test("hides optional columns independently and honors custom order", () => {
  const compact = renderTable(rows, {
    columns: ["package", "before", "after", "step"],
  });
  assert.ok(!compact.includes("Direction"));
  assert.ok(compact.includes("Step"));
  const reordered = renderTable(rows, {
    columns: ["step", "package", "direction"],
  });
  const header = reordered.split("\n")[1];
  assert.ok(header);
  assert.ok(header.indexOf("Step") < header.indexOf("Package"));
  assert.ok(header.indexOf("Package") < header.indexOf("Direction"));
  assert.ok(!reordered.includes("Before"));
  assert.ok(!reordered.includes("After"));
});

test("an empty diff prints a useful message", () => {
  assert.equal(renderTable([]), "No dependency version changes.");
});

test("narrow tables wrap long names and versions without truncation", () => {
  const long: DiffRow = {
    package: "@example/a-very-long-package-name-for-testing",
    before: "12.34.56-prerelease.123+longbuild.987",
    after: "12.34.56-prerelease.124+longbuild.988",
    direction: "upgrade",
    step: "suffix",
  };
  const table = renderTable([long], { width: 70 });
  assert.ok(table.split("\n").every((line) => line.length <= 70));
  assert.ok(!table.includes("…"));
  assert.equal(bodyColumn(table, 0), long.package);
  assert.equal(bodyColumn(table, 1), long.before);
  assert.equal(bodyColumn(table, 2), long.after);
  assert.equal(
    stripVTControlCharacters(renderTable([long], { width: 70, color: true })),
    table,
  );
});

test("untrusted labels cannot inject ANSI, new rows, or bidi control characters", () => {
  const malicious: DiffRow = {
    package: "safe\nforged\u001b[31m\u202e\u061c\u200e",
    before: "git:old\r\u001b[2J",
    after: "git:new\u001b]8;;https://example.com\u0007click\u001b]8;;\u0007",
    direction: "changed",
    step: "unknown",
  };
  const table = renderTable([malicious]);
  assert.equal(table, stripVTControlCharacters(table));
  assert.ok(!table.includes("\u202e"));
  assert.ok(!table.includes("\u061c"));
  assert.ok(!table.includes("\u200e"));
  assert.ok(table.includes("\\u202e\\u061c\\u200e"));
  assert.ok(!table.includes("…"));
  assert.ok(table.includes("safe\\nforged"));
  assert.ok(table.includes("git:old\\r"));
  assert.equal(
    table.split("\n").filter((line) => line.startsWith("│")).length,
    2,
  );
});

test("narrow Unicode content preserves graphemes", () => {
  const packageName = "@scope/漢字漢字漢字漢字👩‍💻";
  const table = renderTable(
    [
      {
        package: packageName,
        before: null,
        after: "1.0.0",
        direction: "add",
        step: null,
      },
    ],
    { width: 58 },
  );
  assert.ok(!table.includes("…"));
  assert.ok(!table.includes("�"));
  assert.ok(table.includes("👩‍💻"));
  assert.ok(table.split("\n").every((line) => stringWidth(line) <= 58));
  assert.equal(bodyColumn(table, 0), packageName);
});

test("single changes keep package names clean and contextual metadata optional", () => {
  const table = renderTable([
    {
      package: "shared",
      context: "apps/web",
      scope: "transitive",
      before: "1.0.0",
      after: "2.0.0",
      direction: "upgrade",
      step: "major",
    },
  ]);
  assert.equal(bodyColumn(table, 0), "shared");
  assert.ok(!table.includes("Context"));
  assert.ok(!table.includes("Scope"));
  assert.ok(!table.includes("apps/web"));
  assert.ok(!table.includes("transitive"));
});

test("automatic Context distinguishes opposite changes without changing package cells", () => {
  const contextual: readonly DiffRow[] = [
    {
      package: "shared",
      context: "apps/web",
      before: "1.0.0",
      after: "2.0.0",
      direction: "upgrade",
      step: "major",
    },
    {
      package: "shared",
      context: "apps/api",
      before: "2.0.0",
      after: "1.0.0",
      direction: "downgrade",
      step: "major",
    },
  ];
  const table = renderTable(contextual);
  assert.equal(bodyColumn(table, 0), "sharedshared");
  assert.equal(bodyColumn(table, 1), "apps/webapps/api");
  assert.ok(table.includes("Context"));
  assert.ok(!table.includes("shared ["));
  assert.ok(
    table
      .split("\n")
      .some((line) => line.includes("apps/web") && line.includes("↑ upgrade")),
  );
  assert.ok(
    table
      .split("\n")
      .some(
        (line) => line.includes("apps/api") && line.includes("↓ downgrade"),
      ),
  );
  assert.equal(
    stripVTControlCharacters(renderTable(contextual, { color: true })),
    table,
  );

  const [first] = contextual;
  assert.ok(first);
  const long: DiffRow = {
    ...first,
    context: "apps/deeply/nested/workspace/node_modules/shared",
  };
  const wrapped = renderTable([long], { width: 60, context: "always" });
  assert.ok(wrapped.split("\n").every((line) => stringWidth(line) <= 60));
  assert.ok(!wrapped.includes("…"));
  assert.equal(bodyColumn(wrapped, 0), "shared");
  assert.equal(bodyColumn(wrapped, 1), long.context);
});

test("context modes control automatic columns while explicit column selections win", () => {
  const row: DiffRow = {
    package: "shared",
    before: "1.0.0",
    after: "2.0.0",
    direction: "upgrade",
    step: "major",
    context: "apps/web",
  };
  const forced = renderTable([row], { context: "always" });
  assert.ok(forced.includes("Context"));
  assert.equal(bodyColumn(forced, 1), "apps/web");
  const hidden = renderTable([row, { ...row, context: "apps/api" }], {
    context: "never",
  });
  assert.ok(!hidden.includes("Context"));
  assert.ok(!hidden.includes("apps/"));

  const selected = renderTable([row], {
    columns: ["after", "context", "package"],
    context: "never",
  });
  assert.equal(bodyColumn(selected, 0), "2.0.0");
  assert.equal(bodyColumn(selected, 1), "apps/web");
  assert.equal(bodyColumn(selected, 2), "shared");
  const omitted = renderTable([row], {
    columns: ["package", "direction"],
    context: "always",
  });
  assert.ok(!omitted.includes("Context"));
  assert.ok(!omitted.includes("apps/web"));

  const withoutContext: DiffRow = {
    package: "shared",
    before: null,
    after: "3.0.0",
    direction: "add",
    step: null,
  };
  assert.ok(!renderTable([withoutContext, withoutContext]).includes("Context"));
  assert.equal(
    bodyColumn(renderTable([withoutContext], { columns: ["context"] }), 0),
    "—",
  );
});

test("Scope is an independently selectable column and missing scope stays unknown", () => {
  const row: DiffRow = {
    package: "shared",
    before: null,
    after: "3.0.0",
    direction: "add",
    step: null,
  };
  const table = renderTable(
    [row, { ...row, scope: "direct" }, { ...row, scope: "both" }],
    { columns: ["scope", "package"] },
  );
  assert.equal(bodyColumn(table, 0), "unknowndirectboth");
  assert.equal(bodyColumn(table, 1), "sharedsharedshared");
  assert.ok(!table.includes("Context"));
  assert.equal(
    stripVTControlCharacters(
      renderTable([row], { columns: ["scope", "package"], color: true }),
    ),
    renderTable([row], { columns: ["scope", "package"] }),
  );
});

test("contexts receive the same terminal-control sanitization as package names", () => {
  const table = renderTable(
    [
      {
        package: "safe",
        context: "apps/web\nforged\u001b[31m\u202e",
        before: "1.0.0",
        after: "2.0.0",
        direction: "upgrade",
        step: "major",
      },
    ],
    { context: "always" },
  );
  assert.equal(table, stripVTControlCharacters(table));
  assert.equal(bodyColumn(table, 0), "safe");
  assert.ok(table.includes("apps/web\\nforged\\u202e"));
  assert.ok(!table.includes("\u202e"));
  assert.equal(
    table.split("\n").filter((line) => line.startsWith("│")).length,
    2,
  );
});
