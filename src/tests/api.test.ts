import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect } from "effect";
import { stringify } from "yaml";
import { type DiffRow, diffLockfiles, parseLockfile } from "../api.js";

type DependencyVersions = Readonly<Record<string, string>>;
interface Fixture {
  readonly source: string;
  readonly text: string;
}

const npmV3 = (
  dependencies: DependencyVersions,
  projectVersion = "0.1.0",
): Fixture => ({
  source: "sample/package-lock.json",
  text: JSON.stringify({
    name: "quarry-demo",
    version: projectVersion,
    lockfileVersion: 3,
    packages: {
      "": { name: "quarry-demo", version: projectVersion },
      ...Object.fromEntries(
        Object.entries(dependencies).map(([name, version]) => [
          `node_modules/${name}`,
          { version },
        ]),
      ),
    },
  }),
});

const pnpmV9 = (dependencies: DependencyVersions): Fixture => {
  const packages = Object.fromEntries(
    Object.entries(dependencies).map(([name, version]) => [
      `${name}@${version}`,
      {},
    ]),
  );
  return {
    source: "sample/pnpm-lock.yaml",
    text: stringify({
      lockfileVersion: "9.0",
      importers: {
        ".": {
          dependencies: Object.fromEntries(
            Object.entries(dependencies).map(([name, version]) => [
              name,
              { specifier: version, version },
            ]),
          ),
        },
      },
      packages,
      snapshots: structuredClone(packages),
    }),
  };
};

const formats = [
  { name: "npm v3", fixture: npmV3 },
  { name: "pnpm v9", fixture: pnpmV9 },
];

const previousVersions: DependencyVersions = {
  "unused-cache": "0.4.0",
  "@quarry/codec": "2.7.1",
  "steady-core": "5.0.0",
};
const nextVersions: DependencyVersions = {
  "@quarry/palette": "1.0.0",
  "steady-core": "5.0.0",
  "@quarry/codec": "2.8.0",
};

const parseFixture = ({ text, source }: Fixture) => parseLockfile(text, source);

const reverseDirections: Readonly<
  Record<DiffRow["direction"], DiffRow["direction"]>
> = {
  add: "remove",
  remove: "add",
  upgrade: "downgrade",
  downgrade: "upgrade",
  changed: "changed",
};

for (const { name, fixture } of formats) {
  test(`${name}: the public diff accepts frozen inputs, ignores entry order, and reverses unambiguous changes`, async () => {
    const reverseEntries = (versions: DependencyVersions) =>
      Object.fromEntries(Object.entries(versions).reverse());
    const inputs = await Effect.runPromise(
      Effect.all({
        before: parseFixture(fixture(previousVersions)),
        after: parseFixture(fixture(nextVersions)),
        reorderedBefore: parseFixture(
          fixture(reverseEntries(previousVersions)),
        ),
        reorderedAfter: parseFixture(fixture(reverseEntries(nextVersions))),
      }),
    );
    for (const input of Object.values(inputs)) {
      for (const entry of input.packages) Object.freeze(entry);
      for (const entry of input.references ?? []) Object.freeze(entry);
      Object.freeze(input.packages);
      if (input.references) Object.freeze(input.references);
      Object.freeze(input);
    }

    const forward = diffLockfiles(inputs.before, inputs.after);
    assert.equal(forward.length, 3);
    assert.deepEqual(
      diffLockfiles(inputs.reorderedBefore, inputs.reorderedAfter),
      forward,
    );
    assert.deepEqual(
      diffLockfiles(inputs.after, inputs.before),
      forward.map((row) => ({
        ...row,
        before: row.after,
        after: row.before,
        direction: reverseDirections[row.direction],
      })),
    );
  });
}

const compare = (before: Fixture, after: Fixture) =>
  Effect.all([parseFixture(before), parseFixture(after)]).pipe(
    Effect.map(([oldLockfile, newLockfile]) =>
      diffLockfiles(oldLockfile, newLockfile),
    ),
  );

const expectedChanges: readonly DiffRow[] = [
  {
    package: "@quarry/codec",
    before: "2.7.1",
    after: "2.8.0",
    direction: "upgrade",
    step: "minor",
  },
  {
    package: "@quarry/palette",
    before: null,
    after: "1.0.0",
    direction: "add",
    step: null,
  },
  {
    package: "unused-cache",
    before: "0.4.0",
    after: null,
    direction: "remove",
    step: null,
  },
];

for (const { name, fixture } of formats) {
  test(`${name}: the public API returns typed additions, removals, and semver updates`, async () => {
    assert.deepEqual(
      await Effect.runPromise(
        compare(fixture(previousVersions), fixture(nextVersions)),
      ),
      expectedChanges,
    );
  });
}

test("npm project metadata does not produce dependency changes", async () => {
  assert.deepEqual(
    await Effect.runPromise(
      compare(npmV3(previousVersions), npmV3(previousVersions, "9.0.0")),
    ),
    [],
  );
});

test("an unchanged scoped dependency can move from a root installation into a parent", async () => {
  const before = npmV3({
    "@quarry/codec": "2.7.1",
    "host-tool": "4.0.0",
  });
  const after: Fixture = {
    source: "nested/package-lock.json",
    text: JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "quarry-demo", version: "0.1.0" },
        "node_modules/host-tool": { version: "4.0.0" },
        "node_modules/host-tool/node_modules/@quarry/codec": {
          version: "2.7.1",
        },
      },
    }),
  };
  assert.deepEqual(await Effect.runPromise(compare(before, after)), []);
});

test("public rows sort scoped and unscoped package names consistently across formats", async () => {
  const unsorted = {
    "zircon-adapter": "0.2.0",
    "@quarry/zinc": "3.0.0",
    "@amber/core": "1.1.0",
    "@quarry/argon": "2.0.4",
  };
  for (const { name, fixture } of formats) {
    const changes = await Effect.runPromise(
      compare(fixture({}), fixture(unsorted)),
    );
    assert.deepEqual(
      changes.map((row) => row.package),
      ["@amber/core", "@quarry/argon", "@quarry/zinc", "zircon-adapter"],
      name,
    );
  }
});

test("switching package managers preserves unchanged inventory and comparable version changes", async () => {
  for (const [before, after] of [
    [npmV3, pnpmV9],
    [pnpmV9, npmV3],
  ] as const) {
    assert.deepEqual(
      await Effect.runPromise(
        compare(before(previousVersions), after(previousVersions)),
      ),
      [],
    );
    assert.deepEqual(
      await Effect.runPromise(
        compare(before(previousVersions), after(nextVersions)),
      ),
      expectedChanges,
    );
  }
});
