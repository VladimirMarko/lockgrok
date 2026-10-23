import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { before, test } from "node:test";
import { Effect } from "effect";
import {
  type GeneratedPreviews,
  checkPreviews,
  generatePreviews,
  writePreviews,
} from "../preview-artifacts.mjs";

let previews: GeneratedPreviews;
before(async () => {
  previews = await Effect.runPromise(generatePreviews());
});

test("preview generation is deterministic and produces SVG and PNG from the CLI", async () => {
  const again = await Effect.runPromise(generatePreviews());
  assert.equal(again.svg, previews.svg);
  assert.deepEqual(again.png, previews.png);
  assert.equal(
    Buffer.from(previews.png).subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
  );
  assert.ok(previews.svg.includes("+ add"));
  assert.ok(previews.svg.includes("− remove"));
  assert.ok(!previews.svg.includes("+ added"));
  assert.ok(!previews.svg.includes("− removed"));
  assert.equal(previews.changes, 7);
});

test("one generation writes both previews and the freshness check accepts them", async (t) => {
  const directory = await mkdtemp(path.join(process.cwd(), ".preview-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await Effect.runPromise(writePreviews(directory, previews));
  assert.equal(
    await readFile(path.join(directory, "table-preview.svg"), "utf8"),
    previews.svg,
  );
  assert.deepEqual(
    await readFile(path.join(directory, "table-preview.png")),
    previews.png,
  );
  await Effect.runPromise(checkPreviews(directory, previews));
});

for (const filename of ["table-preview.svg", "table-preview.png"]) {
  test(`the check rejects stale ${filename} without repairing either file`, async (t) => {
    const directory = await mkdtemp(path.join(process.cwd(), ".preview-test-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await Effect.runPromise(writePreviews(directory, previews));
    const stale = Buffer.from(`stale ${filename}`);
    await writeFile(path.join(directory, filename), stale);
    const beforeSvg = await readFile(path.join(directory, "table-preview.svg"));
    const beforePng = await readFile(path.join(directory, "table-preview.png"));
    const error = await Effect.runPromise(
      Effect.flip(checkPreviews(directory, previews)),
    );
    assert.equal(error._tag, "PreviewError");
    assert.ok(error.message.includes(filename));
    assert.match(error.message, /npm run preview/);
    assert.deepEqual(
      await readFile(path.join(directory, "table-preview.svg")),
      beforeSvg,
    );
    assert.deepEqual(
      await readFile(path.join(directory, "table-preview.png")),
      beforePng,
    );
  });

  test(`the check rejects a missing ${filename} without creating it`, async (t) => {
    const directory = await mkdtemp(path.join(process.cwd(), ".preview-test-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await Effect.runPromise(writePreviews(directory, previews));
    await rm(path.join(directory, filename));
    const error = await Effect.runPromise(
      Effect.flip(checkPreviews(directory, previews)),
    );
    assert.equal(error._tag, "PreviewError");
    assert.ok(error.message.includes(filename));
    assert.match(error.message, /npm run preview/);
    await assert.rejects(readFile(path.join(directory, filename)), {
      code: "ENOENT",
    });
  });
}
