import { fileURLToPath } from "node:url";
import type { DiffRow, LockedPackage, PackageManager } from "../../api.js";

type ExpectedChanges =
  | { readonly kind: "shared"; readonly rows: readonly DiffRow[] }
  | {
      readonly kind: "by-manager";
      readonly rows: Readonly<Record<PackageManager, readonly DiffRow[]>>;
    };

export interface Scenario {
  readonly name: string;
  readonly description: string;
  readonly inventory: {
    readonly before: readonly LockedPackage[];
    readonly after: readonly LockedPackage[];
  };
  readonly expected: ExpectedChanges;
}

const workspaces: readonly LockedPackage[] = [
  { name: "@fixture/web", version: "link:apps/web" },
  { name: "@fixture/worker", version: "link:apps/worker" },
];

const unchanged: readonly LockedPackage[] = [
  { name: "@fixture/config", version: "1.1.0" },
];

const twoVersions: readonly LockedPackage[] = [
  { name: "@fixture/host", version: "1.0.0" },
  { name: "@fixture/shared", version: "1.0.0" },
  { name: "@fixture/shared", version: "2.0.0" },
];

/** Hand-written expectations for the adjacent self-authored lockfile pairs. */
export const scenarios: readonly Scenario[] = [
  {
    name: "major-upgrade",
    description: "an upgrade drops an obsolete transitive dependency",
    inventory: {
      before: [
        { name: "@fixture/engine", version: "1.2.3" },
        { name: "@fixture/legacy", version: "0.4.1" },
      ],
      after: [{ name: "@fixture/engine", version: "2.0.0" }],
    },
    expected: {
      kind: "shared",
      rows: [
        {
          package: "@fixture/engine",
          before: "1.2.3",
          after: "2.0.0",
          direction: "upgrade",
          step: "major",
        },
        {
          package: "@fixture/legacy",
          before: "0.4.1",
          after: null,
          direction: "remove",
          step: null,
        },
      ],
    },
  },
  {
    name: "version-steps",
    description: "minor changes and suffix changes retain their direction",
    inventory: {
      before: [
        { name: "@fixture/build", version: "1.0.0+old" },
        { name: "@fixture/calendar", version: "3.4.0" },
        { name: "@fixture/pinboard", version: "2.4.1" },
        { name: "@fixture/preflight", version: "1.0.0-beta.1" },
      ],
      after: [
        { name: "@fixture/build", version: "1.0.0+new" },
        { name: "@fixture/calendar", version: "3.5.0" },
        { name: "@fixture/pinboard", version: "2.3.9" },
        { name: "@fixture/preflight", version: "1.0.0-beta.2" },
      ],
    },
    expected: {
      kind: "shared",
      rows: [
        {
          package: "@fixture/build",
          before: "1.0.0+old",
          after: "1.0.0+new",
          direction: "changed",
          step: "suffix",
        },
        {
          package: "@fixture/calendar",
          before: "3.4.0",
          after: "3.5.0",
          direction: "upgrade",
          step: "minor",
        },
        {
          package: "@fixture/pinboard",
          before: "2.4.1",
          after: "2.3.9",
          direction: "downgrade",
          step: "minor",
        },
        {
          package: "@fixture/preflight",
          before: "1.0.0-beta.1",
          after: "1.0.0-beta.2",
          direction: "upgrade",
          step: "suffix",
        },
      ],
    },
  },
  {
    name: "workspace-additions",
    description: "two workspaces add dependencies and a transitive package",
    inventory: {
      before: workspaces,
      after: [
        { name: "@fixture/cache", version: "1.3.0" },
        { name: "@fixture/codec", version: "2.0.0" },
        { name: "@fixture/storage", version: "0.8.0" },
        ...workspaces,
      ],
    },
    expected: {
      kind: "shared",
      rows: [
        {
          package: "@fixture/cache",
          before: null,
          after: "1.3.0",
          direction: "add",
          step: null,
        },
        {
          package: "@fixture/codec",
          before: null,
          after: "2.0.0",
          direction: "add",
          step: null,
        },
        {
          package: "@fixture/storage",
          before: null,
          after: "0.8.0",
          direction: "add",
          step: null,
        },
      ],
    },
  },
  {
    name: "workspace-link",
    description: "a new workspace preserves its opaque link target",
    inventory: {
      before: [{ name: "@fixture/web", version: "link:apps/web" }],
      after: [
        { name: "@fixture/api", version: "link:apps/api" },
        { name: "@fixture/web", version: "link:apps/web" },
      ],
    },
    expected: {
      kind: "shared",
      rows: [
        {
          package: "@fixture/api",
          before: null,
          after: "link:apps/api",
          direction: "add",
          step: null,
        },
      ],
    },
  },
  {
    name: "metadata-only",
    description: "project and package metadata do not create version changes",
    inventory: { before: unchanged, after: unchanged },
    expected: { kind: "shared", rows: [] },
  },
  {
    name: "consumer-swap",
    description: "consumers swap versions while the inventory stays the same",
    inventory: { before: twoVersions, after: twoVersions },
    expected: {
      kind: "by-manager",
      rows: {
        npm: [
          {
            package: "@fixture/shared",
            before: "1.0.0",
            after: "2.0.0",
            direction: "upgrade",
            step: "major",
          },
          {
            package: "@fixture/shared",
            before: "2.0.0",
            after: "1.0.0",
            direction: "downgrade",
            step: "major",
            context: "@fixture/host@1.0.0 → @fixture/shared",
          },
        ],
        pnpm: [
          {
            package: "@fixture/shared",
            before: "1.0.0",
            after: "2.0.0",
            direction: "upgrade",
            step: "major",
          },
          {
            package: "@fixture/shared",
            before: "2.0.0",
            after: "1.0.0",
            direction: "downgrade",
            step: "major",
            context: "@fixture/host@1.0.0 → @fixture/shared",
          },
        ],
      },
    },
  },
];

export function expectedRows(
  scenario: Scenario,
  manager: PackageManager,
): readonly DiffRow[] {
  return scenario.expected.kind === "shared"
    ? scenario.expected.rows
    : scenario.expected.rows[manager];
}

export function scenarioFiles(
  scenario: Scenario,
  manager: PackageManager,
): { readonly before: string; readonly after: string } {
  const extension = manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml";
  const directory = new URL(
    `../fixtures/scenarios/${scenario.name}/`,
    import.meta.url,
  );
  return {
    before: fileURLToPath(new URL(`before.${extension}`, directory)),
    after: fileURLToPath(new URL(`after.${extension}`, directory)),
  };
}
