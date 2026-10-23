export { classifyChange } from "./classifyChange.js";
export { createDiffReport, diffLockfiles } from "./diffLockfiles.js";
export { parseLockfile } from "./parseLockfile.js";
export { renderReport } from "./renderReport.js";
export { renderTable } from "./renderTable.js";
export { InputError, LockfileError, SourceError } from "./errors.js";
export type { CliError } from "./errors.js";
export type {
  ChangedVersion,
  ChangeReference,
  ChangeSummary,
  ContextMode,
  DependencyCategory,
  DependencyEdge,
  DependencyGraph,
  DependencyScope,
  DependencyUsage,
  DiffOptions,
  DiffReport,
  DependencyReference,
  DiffRow,
  LockedPackage,
  Lockfile,
  PackageManager,
  PackageDetail,
  ProjectRoot,
  ReportedChange,
  ReportOptions,
  ResolvedNode,
  ScopeFilter,
  VersionDetail,
  TableColumn,
  TableOptions,
  VersionChange,
  VersionStep,
} from "./model.js";
