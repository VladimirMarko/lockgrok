# Testing

Development commands and fixture paths in this guide refer to a source checkout.
The installable tarball includes this guide but excludes test code and fixtures.

Run the repository checks on Node.js 22.13 or newer:

```sh
npm ci
npm run check
```

`check` runs strict TypeScript validation, Biome, the test suite, the production
build, and preview freshness verification. The CI workflow runs it on Node
22.13.0 and 24, followed by a package-content dry run. CI has no publishing job.

## Focused checks

```sh
npm test
node --import tsx --test src/tests/classifyChange.test.ts
npm run typecheck
npm run lint
npm run build
npm pack
```

For behavior changes, write a failing test, implement the change, and run the
focused suite before `npm run check`. Tests use `node:test`,
`node:assert/strict`, and `tsx`. Expected changes are written by hand rather
than computed by the production matcher.

## Coverage

| Area | Checks |
| --- | --- |
| Parsing | npm v1/v2/v3, pnpm v5.4/v6/v9, multi-document pnpm input, aliases, opaque sources, and malformed fields |
| Version classification | Numeric version steps, prerelease ordering, build metadata, additions, and removals |
| npm graph | Hoisting, nested dependencies, aliases, workspace patterns, local links, optional/peer declarations, and incomplete root declarations |
| pnpm graph | Snapshot and peer identities, changing parents, selected peer variants, aliases, and local links |
| Comparison and reports | Consumer swaps, retained versions, scope, workspace reachability, inventory inference, ambiguous add/remove cases, and reference-only API input |
| API contracts | Frozen inputs, deterministic ordering, reversible unambiguous changes, and cross-manager comparisons |
| Presentation | Columns, summaries, details, colors, Unicode wrapping, and terminal-control sanitization |
| CLI and sources | Git refs, explicit files, symlinks, shrinkwrap precedence, filters, JSON forms, and exit codes |
| Packaging | Clean builds, public exports, ESM/CommonJS loading, Effect interoperability, package identity, and included notices |

## Fixtures and Git isolation

Comparison scenarios in `src/tests/fixtures/scenarios/` contain six small
before/after pairs in both npm v3 and pnpm v9. They cover version
steps, workspace additions and links, metadata-only changes, and consumer swaps.
The shared helper supplies expected inventories and rows for public API and
file-mode CLI tests. These fixtures are parser inputs, not installable projects.

Generated parser fixtures in `src/tests/fixtures/parser-generated/` include
exact local input manifests, tool versions, checksums, and an offline reproduction
recipe in their `README.md`. Focused parser tests cover the other supported formats.

Git integration tests create disposable histories from static inputs. The helper
isolates Git configuration, environment variables, templates, and hooks. Tests
check that comparisons preserve file contents, HEAD, branch, and status, then
remove their temporary directories. No stored Git repositories are required.

## Preview lifecycle

```sh
npm run preview        # write both images
npm run preview:check  # verify both images without writing
```

`preview` runs the CLI against both example formats, checks identical output and
the seven expected change categories, and verifies that removing ANSI color
codes yields the plain output. It generates `docs/table-preview.svg` from that
output and renders `docs/table-preview.png` from the SVG. `npm run demo` is an
alias for `preview`.

PNG rendering uses pinned `@resvg/resvg-js` 2.6.2 and bundled DejaVu Sans Mono
regular/bold fonts with system font loading disabled. Artifacts have no
timestamps. After changing the renderer, examples, fonts, or renderer dependency,
regenerate and inspect both images, then commit them together.

`preview:check` compares exact bytes and fails for stale, missing, or unreadable
images without repairing them. Both `check` and `prepack` run this check;
`prepack` also builds the package. Tests verify that failed freshness checks
leave existing images untouched.

## Local package verification

`npm pack` builds the package and verifies preview freshness before creating a
tarball. Package tests check import boundaries and distribution contents. Process
tests exercise CLI output, errors, color, and version reporting. The package
remains private to prevent accidental publication; see
[License status](../LICENSE-STATUS.md).
