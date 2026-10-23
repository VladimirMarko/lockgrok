# Lockfile comparison scenarios

These fixtures were authored for this project using fictional `@fixture/*`
packages. They are independent examples, not copies of another project's
lockfiles or package source. The project's license scope is documented in
[LICENSE-STATUS.md](../../../../LICENSE-STATUS.md). No separate license grant
is made for these fixtures.

Each directory contains a before/after pair in both npm lockfile version 3 and
pnpm lockfile version 9. The files are deliberately small, static, readable
JSON/YAML. They retain the dependency graph and installation/reference details
needed by each scenario; download URLs and integrity metadata are omitted. They
are parser inputs, not projects intended for installation.

| Scenario | Behavior |
| --- | --- |
| `major-upgrade` | A major upgrade removes an obsolete transitive dependency. |
| `version-steps` | Minor upgrade, minor downgrade, prerelease upgrade, and unordered build-metadata change. |
| `workspace-additions` | Two workspaces add different dependencies, including a transitive package. |
| `workspace-link` | Adding a workspace retains its opaque local link target. |
| `metadata-only` | Project version, engine metadata, settings, and production/development classification change without a dependency version change. |
| `consumer-swap` | A direct consumer upgrades while an unchanged parent downgrades, with both versions still present in the inventory. |

The hand-written inventories and expected rows live in
[`../../helpers/scenarios.ts`](../../helpers/scenarios.ts). Both managers use the
same expected changes except for their native reference context labels in
`consumer-swap`. The test compares these expectations against the public parser
and diff API, then against `runCli` reading the actual files with
`--before`, `--after`, `--json`, and `--exit-code`.

No fixture builder computes expected results from production code. No stored Git
objects, sample hooks, installed packages, network requests, or mounts are needed
to run these file scenarios. Git integration tests create temporary histories
from the same inputs.

## Other parser coverage

Focused parser tests also cover npm v1/v2 and pnpm v5.4/v6. The separate
[`parser-generated/` fixtures](../parser-generated/README.md) contain actual
package-manager output from local packages and include a reproduction recipe.
