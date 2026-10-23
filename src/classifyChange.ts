import { parse } from "semver";
import type { VersionChange, VersionStep } from "./model.js";

/** Compare SemVer precedence, keeping build metadata visible without ranking it. */
export const classifyChange = (
  before: string,
  after: string,
): VersionChange => {
  if (before === after) return { direction: "unchanged", step: "none" };

  const oldVersion = parse(before);
  const newVersion = parse(after);
  if (!oldVersion || !newVersion) {
    return { direction: "changed", step: "unknown" };
  }

  const precedence = oldVersion.compare(newVersion);
  if (precedence === 0) {
    return oldVersion.build.join(".") === newVersion.build.join(".")
      ? { direction: "unchanged", step: "none" }
      : { direction: "changed", step: "suffix" };
  }

  let step: VersionStep = "suffix";
  if (oldVersion.major !== newVersion.major) step = "major";
  else if (oldVersion.minor !== newVersion.minor) step = "minor";
  else if (oldVersion.patch !== newVersion.patch) step = "patch";

  return { direction: precedence < 0 ? "upgrade" : "downgrade", step };
};
