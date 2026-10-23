/** A resolved package inventory, independent of installation layout. */
export interface LockedPackage {
  readonly name: string;
  readonly version: string;
}

export type PackageManager = "npm" | "pnpm";

/** A stable installation location or dependency edge within one package manager. */
export interface DependencyReference extends LockedPackage {
  readonly id: string;
  readonly context?: string;
}

export type DependencyCategory =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies";

/** Snapshot-local identity retains installation locations and pnpm peer variants. */
export interface ResolvedNode extends LockedPackage {
  readonly id: string;
  readonly label?: string;
  readonly location?: string;
}

export interface DependencyEdge {
  readonly from: string;
  readonly to: string;
  readonly alias: string;
  readonly categories: readonly DependencyCategory[];
}

export interface ProjectRoot {
  /** Normalized lockfile-relative workspace path; the root project is ".". */
  readonly id: string;
  readonly node: string;
}

export interface DependencyGraph {
  readonly nodes: readonly ResolvedNode[];
  readonly edges: readonly DependencyEdge[];
  readonly projects: readonly ProjectRoot[];
}

export interface Lockfile {
  readonly manager: PackageManager;
  readonly lockfileVersion: string;
  readonly packages: readonly LockedPackage[];
  readonly references?: readonly DependencyReference[];
  readonly graph?: DependencyGraph;
}

export type DependencyScope = "direct" | "transitive" | "both" | "unknown";
export type ScopeFilter = "all" | DependencyScope;
export type ContextMode = "auto" | "always" | "never";

export type VersionStep = "major" | "minor" | "patch" | "suffix";

export type ChangedVersion =
  | { readonly direction: "upgrade" | "downgrade"; readonly step: VersionStep }
  | { readonly direction: "changed"; readonly step: "suffix" | "unknown" };

export type VersionChange =
  | ChangedVersion
  | { readonly direction: "unchanged"; readonly step: "none" };

export type DiffRow = (
  | {
      readonly package: string;
      readonly before: null;
      readonly after: string;
      readonly direction: "add";
      readonly step: null;
    }
  | {
      readonly package: string;
      readonly before: string;
      readonly after: null;
      readonly direction: "remove";
      readonly step: null;
    }
  | ({
      readonly package: string;
      readonly before: string;
      readonly after: string;
    } & ChangedVersion)
) & { readonly context?: string; readonly scope?: DependencyScope };

export interface DependencyUsage {
  readonly id: string;
  readonly consumerId: string;
  readonly consumer: string;
  readonly alias: string;
  readonly targetId: string;
  readonly scope: DependencyScope;
  readonly projects: readonly string[];
}

export interface ChangeReference {
  readonly before: DependencyUsage | null;
  readonly after: DependencyUsage | null;
}

export interface ReportedChange {
  readonly row: DiffRow;
  readonly match: "dependency" | "installation" | "inventory";
  readonly scope: DependencyScope;
  readonly references: readonly ChangeReference[];
}

export interface VersionDetail {
  readonly version: string;
  readonly scope: DependencyScope;
  readonly references: readonly DependencyUsage[];
}

export interface PackageDetail {
  readonly package: string;
  readonly before: readonly VersionDetail[];
  readonly after: readonly VersionDetail[];
  readonly retained: readonly string[];
  readonly changes: readonly ReportedChange[];
}

export interface ChangeSummary {
  readonly packages: number;
  readonly changes: number;
  readonly upgrade: number;
  readonly downgrade: number;
  readonly add: number;
  readonly remove: number;
  readonly changed: number;
}

export interface DiffReport {
  readonly changes: readonly ReportedChange[];
  readonly packages: readonly PackageDetail[];
  readonly summary: ChangeSummary;
  /** Totals within the selected workspace, before package/scope filtering. */
  readonly total: ChangeSummary;
  readonly workspace?: string;
}

export interface DiffOptions {
  readonly workspace?: string;
  readonly packages?: readonly string[];
  readonly scope?: ScopeFilter;
}

export type TableColumn =
  | "package"
  | "before"
  | "after"
  | "direction"
  | "step"
  | "context"
  | "scope";

export interface TableOptions {
  readonly columns?: readonly TableColumn[];
  readonly color?: boolean;
  readonly width?: number;
  readonly context?: ContextMode;
}

export interface ReportOptions extends TableOptions {
  readonly summary?: boolean;
  readonly details?: boolean;
}
