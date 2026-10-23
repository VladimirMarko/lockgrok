import assert from "node:assert/strict";
import { test } from "node:test";
import { diffLockfiles } from "../diffLockfiles.js";
import type { DependencyReference, LockedPackage, Lockfile } from "../model.js";

const lock = (...packages: readonly LockedPackage[]): Lockfile => ({
  manager: "npm",
  lockfileVersion: "3",
  packages,
});

const pkg = (name: string, version: string): LockedPackage => ({
  name,
  version,
});

test("empty inventories have no changes", () => {
  assert.deepEqual(diffLockfiles(lock(), lock()), []);
});

test("returns a classified update, an addition and a removal in package order", () => {
  const before = lock(pkg("zeta", "1.0.0"), pkg("alpha", "1.2.3"));
  const after = lock(pkg("beta", "3.0.0"), pkg("alpha", "2.0.0"));
  assert.deepEqual(diffLockfiles(before, after), [
    {
      package: "alpha",
      before: "1.2.3",
      after: "2.0.0",
      direction: "upgrade",
      step: "major",
    },
    {
      package: "beta",
      before: null,
      after: "3.0.0",
      direction: "add",
      step: null,
    },
    {
      package: "zeta",
      before: "1.0.0",
      after: null,
      direction: "remove",
      step: null,
    },
  ]);
});

test("same name/version at multiple locations contributes only one inventory entry", () => {
  assert.deepEqual(
    diffLockfiles(
      lock(pkg("pkg", "1.0.0"), pkg("pkg", "1.0.0")),
      lock(pkg("pkg", "2.0.0"), pkg("pkg", "2.0.0")),
    ),
    [
      {
        package: "pkg",
        before: "1.0.0",
        after: "2.0.0",
        direction: "upgrade",
        step: "major",
      },
    ],
  );
});

test("subtracts common versions before pairing a single unmatched old and new version", () => {
  assert.deepEqual(
    diffLockfiles(
      lock(pkg("pkg", "1.0.0"), pkg("pkg", "2.0.0")),
      lock(pkg("pkg", "3.0.0"), pkg("pkg", "1.0.0")),
    ),
    [
      {
        package: "pkg",
        before: "2.0.0",
        after: "3.0.0",
        direction: "upgrade",
        step: "major",
      },
    ],
  );
});

test("never invents pairings when multiple unmatched versions remain", () => {
  assert.deepEqual(
    diffLockfiles(
      lock(pkg("pkg", "2.0.0"), pkg("pkg", "1.0.0")),
      lock(pkg("pkg", "4.0.0"), pkg("pkg", "3.0.0")),
    ),
    [
      {
        package: "pkg",
        before: null,
        after: "3.0.0",
        direction: "add",
        step: null,
      },
      {
        package: "pkg",
        before: null,
        after: "4.0.0",
        direction: "add",
        step: null,
      },
      {
        package: "pkg",
        before: "1.0.0",
        after: null,
        direction: "remove",
        step: null,
      },
      {
        package: "pkg",
        before: "2.0.0",
        after: null,
        direction: "remove",
        step: null,
      },
    ],
  );
});

test("one-to-many changes remain additions and removals", () => {
  const rows = diffLockfiles(
    lock(pkg("pkg", "1.0.0")),
    lock(pkg("pkg", "2.0.0"), pkg("pkg", "3.0.0")),
  );
  assert.deepEqual(
    rows.map((row) => row.direction),
    ["add", "add", "remove"],
  );
});

test("reordering packages or changing package manager does not create changes", () => {
  const a = pkg("first", "1.0.0");
  const b = pkg("second", "2.0.0");
  assert.deepEqual(
    diffLockfiles(lock(a, b), {
      manager: "pnpm",
      lockfileVersion: "9.0",
      packages: [b, a],
    }),
    [],
  );
});

test("prototype-like names are treated as normal package names", () => {
  const before = lock(pkg("__proto__", "1.0.0"), pkg("constructor", "2.0.0"));
  const after = lock(pkg("__proto__", "2.0.0"), pkg("toString", "1.0.0"));
  assert.deepEqual(
    diffLockfiles(before, after).map((row) => [row.package, row.direction]),
    [
      ["__proto__", "upgrade"],
      ["constructor", "remove"],
      ["toString", "add"],
    ],
  );
});

test("reports downgrades, build-only changes, and changed opaque refs", () => {
  assert.deepEqual(
    diffLockfiles(
      lock(
        pkg("down", "2.3.4"),
        pkg("build", "1.0.0+one"),
        pkg("local", "link:../old"),
      ),
      lock(
        pkg("down", "2.2.9"),
        pkg("build", "1.0.0+two"),
        pkg("local", "link:../new"),
      ),
    ).map(({ package: name, direction, step }) => ({ name, direction, step })),
    [
      { name: "build", direction: "changed", step: "suffix" },
      { name: "down", direction: "downgrade", step: "minor" },
      { name: "local", direction: "changed", step: "unknown" },
    ],
  );
});

test("semantically equivalent version text does not create a change", () => {
  assert.deepEqual(
    diffLockfiles(lock(pkg("pkg", "v1.2.3")), lock(pkg("pkg", "1.2.3"))),
    [],
  );
});

test("common semantic versions are subtracted before an unambiguous update", () => {
  assert.deepEqual(
    diffLockfiles(
      lock(pkg("pkg", "v1.0.0"), pkg("pkg", "2.0.0")),
      lock(pkg("pkg", "1.0.0"), pkg("pkg", "3.0.0")),
    ),
    [
      {
        package: "pkg",
        before: "2.0.0",
        after: "3.0.0",
        direction: "upgrade",
        step: "major",
      },
    ],
  );
});

test("does not mutate either input and is deterministic across input order", () => {
  const before = Object.freeze({
    ...lock(),
    packages: Object.freeze([
      Object.freeze(pkg("z", "2.0.0")),
      Object.freeze(pkg("a", "1.0.0")),
    ]),
  });
  const after = Object.freeze({
    ...lock(),
    packages: Object.freeze([
      Object.freeze(pkg("z", "1.0.0")),
      Object.freeze(pkg("b", "3.0.0")),
    ]),
  });
  const snapshot = JSON.stringify([before, after]);
  const result = diffLockfiles(before, after);
  assert.equal(JSON.stringify([before, after]), snapshot);
  assert.deepEqual(
    result,
    diffLockfiles(
      lock(...[...before.packages].reverse()),
      lock(...[...after.packages].reverse()),
    ),
  );
});

const reference = (
  id: string,
  name: string,
  version: string,
  context?: string,
): DependencyReference => ({
  id,
  name,
  version,
  ...(context === undefined ? {} : { context }),
});

const referencedLock = (
  references: readonly DependencyReference[],
  extraPackages: readonly LockedPackage[] = [],
): Lockfile => ({
  ...lock(
    ...references.map(({ name, version }) => ({ name, version })),
    ...extraPackages,
  ),
  references,
});

test("detects simultaneous root upgrade and nested downgrade when inventories are identical", () => {
  const nested = "node_modules/parent/node_modules/foo";
  assert.deepEqual(
    diffLockfiles(
      referencedLock([
        reference("node_modules/foo", "foo", "1.0.0"),
        reference(nested, "foo", "2.0.0", nested),
      ]),
      referencedLock([
        reference("node_modules/foo", "foo", "2.0.0"),
        reference(nested, "foo", "1.0.0", nested),
      ]),
    ),
    [
      {
        package: "foo",
        before: "1.0.0",
        after: "2.0.0",
        direction: "upgrade",
        step: "major",
      },
      {
        package: "foo",
        before: "2.0.0",
        after: "1.0.0",
        direction: "downgrade",
        step: "major",
        context: nested,
      },
    ],
  );
});

test("an exact reference update consumes generic removed and added inventory rows", () => {
  const before = referencedLock([
    reference("root:foo", "foo", "1.0.0", "app → foo"),
  ]);
  const after = referencedLock([
    reference("root:foo", "foo", "2.0.0", "app → foo"),
  ]);
  assert.deepEqual(diffLockfiles(before, after), [
    {
      package: "foo",
      before: "1.0.0",
      after: "2.0.0",
      direction: "upgrade",
      step: "major",
      context: "app → foo",
    },
  ]);
});

test("reports an exact update when the old version remains elsewhere without a redundant addition", () => {
  const before = referencedLock([
    reference("root:foo", "foo", "1.0.0"),
    reference("nested:foo", "foo", "1.0.0", "parent → foo"),
  ]);
  const after = referencedLock([
    reference("root:foo", "foo", "2.0.0"),
    reference("nested:foo", "foo", "1.0.0", "parent → foo"),
  ]);
  assert.deepEqual(diffLockfiles(before, after), [
    {
      package: "foo",
      before: "1.0.0",
      after: "2.0.0",
      direction: "upgrade",
      step: "major",
    },
  ]);
});

test("exact references take precedence over pairing a removed version with an unrelated new version", () => {
  const before = referencedLock(
    [reference("root:foo", "foo", "1.0.0")],
    [pkg("foo", "2.0.0")],
  );
  const after = referencedLock(
    [reference("root:foo", "foo", "2.0.0")],
    [pkg("foo", "3.0.0")],
  );
  assert.deepEqual(diffLockfiles(before, after), [
    {
      package: "foo",
      before: null,
      after: "3.0.0",
      direction: "add",
      step: null,
    },
    {
      package: "foo",
      before: "1.0.0",
      after: "2.0.0",
      direction: "upgrade",
      step: "major",
    },
  ]);
});

test("retains conservative inventory fallback for versions without matched references", () => {
  const before = referencedLock(
    [reference("root:foo", "foo", "1.0.0")],
    [pkg("bar", "2.0.0")],
  );
  const after = referencedLock(
    [reference("root:foo", "foo", "2.0.0")],
    [pkg("bar", "1.0.0")],
  );
  assert.deepEqual(diffLockfiles(before, after), [
    {
      package: "bar",
      before: "2.0.0",
      after: "1.0.0",
      direction: "downgrade",
      step: "major",
    },
    {
      package: "foo",
      before: "1.0.0",
      after: "2.0.0",
      direction: "upgrade",
      step: "major",
    },
  ]);
});

test("does not emit changes for equivalent reference versions or reference relocation", () => {
  assert.deepEqual(
    diffLockfiles(
      referencedLock([
        reference("same", "foo", "v1.2.3+build.1", "app → foo"),
        reference("old-location", "bar", "2.0.0"),
      ]),
      referencedLock([
        reference("same", "foo", "1.2.3+build.1", "app → foo"),
        reference("new-location", "bar", "2.0.0"),
      ]),
    ),
    [],
  );
});

test("alias target changes emit contextual removal and addition even when both targets remain installed", () => {
  assert.deepEqual(
    diffLockfiles(
      referencedLock(
        [
          reference(
            "node_modules/alias",
            "original",
            "1.0.0",
            "alias → original",
          ),
        ],
        [pkg("replacement", "2.0.0")],
      ),
      referencedLock(
        [
          reference(
            "node_modules/alias",
            "replacement",
            "2.0.0",
            "alias → replacement",
          ),
        ],
        [pkg("original", "1.0.0")],
      ),
    ),
    [
      {
        package: "original",
        before: "1.0.0",
        after: null,
        direction: "remove",
        step: null,
        context: "alias → original",
      },
      {
        package: "replacement",
        before: null,
        after: "2.0.0",
        direction: "add",
        step: null,
        context: "alias → replacement",
      },
    ],
  );
});

test("alias target changes consume their unmatched inventory versions", () => {
  assert.deepEqual(
    diffLockfiles(
      referencedLock([reference("node_modules/alias", "original", "1.0.0")]),
      referencedLock([reference("node_modules/alias", "replacement", "2.0.0")]),
    ),
    [
      {
        package: "original",
        before: "1.0.0",
        after: null,
        direction: "remove",
        step: null,
      },
      {
        package: "replacement",
        before: null,
        after: "2.0.0",
        direction: "add",
        step: null,
      },
    ],
  );
});

test("pnpm workspace references preserve an upgrade and downgrade with common inventory versions", () => {
  const before = {
    ...referencedLock([
      reference("importer:apps/web:foo", "foo", "1.0.0", "apps/web → foo"),
      reference("importer:apps/api:foo", "foo", "2.0.0", "apps/api → foo"),
    ]),
    manager: "pnpm" as const,
    lockfileVersion: "9.0",
  };
  const after = {
    ...referencedLock([
      reference("importer:apps/web:foo", "foo", "2.0.0", "apps/web → foo"),
      reference("importer:apps/api:foo", "foo", "1.0.0", "apps/api → foo"),
    ]),
    manager: "pnpm" as const,
    lockfileVersion: "9.0",
  };
  assert.deepEqual(
    diffLockfiles(before, after).map((row) => [row.direction, row.context]),
    [
      ["upgrade", "apps/web → foo"],
      ["downgrade", "apps/api → foo"],
    ],
  );
});

test("cross-manager comparisons ignore coincidentally matching reference IDs", () => {
  const before = referencedLock(
    [reference("same", "foo", "1.0.0")],
    [pkg("foo", "2.0.0")],
  );
  const after: Lockfile = {
    ...referencedLock(
      [reference("same", "foo", "2.0.0")],
      [pkg("foo", "1.0.0")],
    ),
    manager: "pnpm",
    lockfileVersion: "9.0",
  };
  assert.deepEqual(diffLockfiles(before, after), []);
});

test("preserves distinct contexts while deduplicating exactly repeated rows", () => {
  const before = referencedLock([
    reference("web", "foo", "1.0.0", "web → foo"),
    reference("api", "foo", "1.0.0", "api → foo"),
    reference("duplicate-api", "foo", "1.0.0", "api → foo"),
  ]);
  const after = referencedLock([
    reference("api", "foo", "2.0.0", "api → foo"),
    reference("duplicate-api", "foo", "2.0.0", "api → foo"),
    reference("web", "foo", "2.0.0", "web → foo"),
  ]);
  assert.deepEqual(diffLockfiles(before, after), [
    {
      package: "foo",
      before: "1.0.0",
      after: "2.0.0",
      direction: "upgrade",
      step: "major",
      context: "api → foo",
    },
    {
      package: "foo",
      before: "1.0.0",
      after: "2.0.0",
      direction: "upgrade",
      step: "major",
      context: "web → foo",
    },
  ]);
  assert.deepEqual(
    diffLockfiles(before, after),
    diffLockfiles(
      referencedLock([...(before.references ?? [])].reverse()),
      referencedLock([...(after.references ?? [])].reverse()),
    ),
  );
});

test("reference-only missing context stays absent rather than being an undefined property", () => {
  const rows = diffLockfiles(
    referencedLock([reference("same", "foo", "1.0.0")]),
    referencedLock([reference("same", "foo", "2.0.0")]),
  );
  assert.equal(rows.length, 1);
  assert.equal(Object.hasOwn(rows[0] ?? {}, "context"), false);
});

test("ambiguous duplicate reference IDs fall back to inventory rather than inventing a pairing", () => {
  const before = referencedLock([
    reference("same", "foo", "1.0.0", "api"),
    reference("same", "foo", "2.0.0", "web"),
  ]);
  const after = referencedLock([
    reference("same", "foo", "2.0.0", "api"),
    reference("same", "foo", "1.0.0", "web"),
  ]);
  assert.deepEqual(diffLockfiles(before, after), []);
});
