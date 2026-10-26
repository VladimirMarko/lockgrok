import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { renderTable } from "../../src/renderTable.js";
import { renderPreviewSvg } from "../preview-svg.mjs";

const table = renderTable(
  [
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
  ],
  { color: true },
);

test("SVG preserves real gray add/remove spans and provides a monospace fallback", () => {
  const { svg } = renderPreviewSvg(`${table}\n`, "lockgrok");
  for (const text of ["+ add", "− remove", "3.0.0", "4.0.0"]) {
    const span = [...svg.matchAll(/<tspan\b([^>]*)>([^<]*)<\/tspan>/g)].find(
      (match) => match[2] === text,
    );
    assert.ok(span, `Missing SVG span for ${text}`);
    assert.ok(span[1]?.includes('fill="#8393ab"'));
    assert.ok(span[1]?.includes('opacity="1"'));
  }
  const families = [...svg.matchAll(/font-family="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(families.length > 0);
  assert.ok(
    families.every((family) => family === "'DejaVu Sans Mono', monospace"),
  );
  assert.match(
    svg,
    /text-anchor="middle"[^>]*font-weight="700">lockgrok<\/text>/,
  );
  assert.equal(svg, stripVTControlCharacters(svg));
});

test("SVG escapes literal table text and derives command and title from its argument", () => {
  const text = `<package>&"'`;
  const output = renderTable(
    [
      {
        package: text,
        before: null,
        after: "1.0.0",
        direction: "add",
        step: null,
      },
    ],
    { color: true },
  );
  const command = `tool<&>"'`;
  const { svg } = renderPreviewSvg(`${output}\n`, command);
  assert.ok(svg.includes("&lt;package&gt;&amp;&quot;&apos;"));
  assert.ok(
    svg.includes(
      '<title id="title">tool&lt;&amp;&gt;&quot;&apos;: npm and pnpm dependency table</title>',
    ),
  );
  assert.ok(
    svg.includes(
      "$ tool&lt;&amp;&gt;&quot;&apos; --before examples/npm-before.json --after examples/npm-after.json",
    ),
  );
  assert.ok(!svg.includes(text));
  assert.ok(!svg.includes(command));
  assert.equal(svg, stripVTControlCharacters(svg));
});

test("SVG output is deterministic and trims exactly one final stdout newline", () => {
  const first = renderPreviewSvg(table, "lockgrok");
  assert.deepEqual(renderPreviewSvg(table, "lockgrok"), first);
  assert.deepEqual(renderPreviewSvg(`${table}\n`, "lockgrok"), first);
  assert.ok(first.width > 0);
  assert.ok(first.height > 0);
  assert.equal(
    renderPreviewSvg(`${table}\n\n`, "lockgrok").height,
    first.height + 25,
  );
  assert.ok(first.svg.includes(`viewBox="0 0 ${first.width} ${first.height}"`));
});
