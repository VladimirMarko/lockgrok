import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";

const cellWidth = 8.4;
const margin = 30;
const rowHeight = 25;
const tableTop = 132;
const foreground = "#d5dfed";
const colors: Readonly<Record<number, string>> = {
  30: "#54647a",
  31: "#ff8c9d",
  32: "#7ce7ac",
  33: "#ffd38a",
  34: "#91b5ff",
  35: "#e6a2ff",
  36: "#73d6ee",
  37: foreground,
  90: "#8393ab",
};

const xmlEntities: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => xmlEntities[character] ?? character);

function svgLine(line: string, y: number, width: number): string {
  let color = foreground;
  let bold = false;
  let dim = false;
  let position = 0;
  let offset = 0;
  const spans: string[] = [];
  function append(text: string): void {
    if (!text) return;
    const length = stringWidth(text);
    spans.push(
      `<tspan x="${margin + position * cellWidth}" fill="${color}" font-weight="${bold ? 700 : 400}" opacity="${dim ? 0.58 : 1}" textLength="${length * cellWidth}" lengthAdjust="spacingAndGlyphs">${escapeXml(text)}</tspan>`,
    );
    position += length;
  }
  // Input is actual renderer output; lockfile values have already been sanitized.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: parse generated ANSI color sequences into SVG spans.
  const sgr = /\x1b\[[0-9;]*m/g;
  for (const match of line.matchAll(sgr)) {
    append(line.slice(offset, match.index));
    for (const code of match[0].slice(2, -1).split(";").map(Number)) {
      if (code === 0) {
        color = foreground;
        bold = false;
        dim = false;
      } else if (code === 1) bold = true;
      else if (code === 2) dim = true;
      else if (code === 22) {
        bold = false;
        dim = false;
      } else if (code === 39) color = foreground;
      else if (colors[code]) color = colors[code];
    }
    offset = match.index + match[0].length;
  }
  append(line.slice(offset));
  assert.ok(margin + position * cellWidth <= width - margin + 0.01);
  return `<text y="${y}" xml:space="preserve">${spans.join("")}</text>`;
}

/** Render actual colored CLI stdout deterministically, without filesystem access. */
export function renderPreviewSvg(
  table: string,
  commandName: string,
): { readonly svg: string; readonly width: number; readonly height: number } {
  const output = table.endsWith("\n") ? table.slice(0, -1) : table;
  const plain = stripVTControlCharacters(output);
  const lines = output.split("\n");
  const command = `$ ${commandName} --before examples/npm-before.json --after examples/npm-after.json`;
  const width = Math.ceil(
    Math.max(
      stringWidth(command),
      ...plain.split("\n").map((line) => stringWidth(line)),
    ) *
      cellWidth +
      2 * margin,
  );
  const height = tableTop + lines.length * rowHeight + 61;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
<title id="title">${escapeXml(commandName)}: npm and pnpm dependency table</title>
<desc id="description">Seven fictional dependency changes: a major upgrade, a build suffix change, an addition, a minor downgrade, a patch upgrade, a removal, and a prerelease suffix upgrade. Generated from the actual CLI table renderer.</desc>
<rect width="${width}" height="${height}" rx="15" fill="#101827"/>
<path d="M15 0H${width - 15}Q${width} 0 ${width} 15V56H0V15Q0 0 15 0Z" fill="#1b2639"/>
<circle cx="28" cy="28" r="5.5" fill="#ff7b89"/><circle cx="47" cy="28" r="5.5" fill="#f4c575"/><circle cx="66" cy="28" r="5.5" fill="#77dba0"/>
<text x="${width / 2}" y="33" text-anchor="middle" font-family="'DejaVu Sans Mono', monospace" font-size="13" fill="#c8d5e8" font-weight="700">${escapeXml(commandName)}</text>
<g font-family="'DejaVu Sans Mono', monospace" font-size="14" fill="${foreground}">
<text x="${margin}" y="94" fill="#98abc6" xml:space="preserve" textLength="${stringWidth(command) * cellWidth}" lengthAdjust="spacingAndGlyphs">${escapeXml(command)}</text>
${lines.map((line, index) => svgLine(line, tableTop + index * rowHeight, width)).join("\n")}
</g>
<text x="${margin}" y="${height - 27}" font-family="'DejaVu Sans Mono', monospace" font-size="13" fill="#8fa4bf">Same version diff for npm and pnpm. Fictional packages; real renderer output.</text>
</svg>
`;
  return { svg, width, height };
}
