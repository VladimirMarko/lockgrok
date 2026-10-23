# Package-manager-generated parser fixtures

These two lockfiles were generated from small local projects created for
`lockgrok` parser validation. They complement the handwritten scenario fixtures
by preserving actual package-manager output.

| Input manifest | Purpose |
| --- | --- |
| `inputs/npm/package.json` | npm project with two local `file:` dependencies |
| `inputs/pnpm/package.json` | pnpm project with one local `file:` dependency and one `link:` dependency |
| `inputs/leaf/package.json` | Local `@fixture/leaf` package at `1.2.3` |
| `inputs/workspace-ui/package.json` | Local `@fixture/ui` package at `2.0.0` |

The four manifests contain the generation inputs, including their names,
versions, dependency paths, and absence of license fields. No
separate license grant is added here; the project's license scope is
recorded in [LICENSE-STATUS.md](../../../../LICENSE-STATUS.md).

## Reproduce without registry access

Use **npm 11.9.0** and **pnpm 11.25.0**, already installed on `PATH`, with
**Node.js 24.19.0** to match the fixture generation environment. Acquiring those
tools is separate from generating these fixtures; the commands below use only
the copied local manifests and dependencies.

Run this Unix shell recipe from the project root. It creates an isolated
temporary copy with fresh npm cache and pnpm store directories, disables scripts,
and compares the generated files with the committed fixtures without replacing
them.

```sh
(
  set -eu
  test "$(npm --version)" = "11.9.0"
  test "$(pnpm --version)" = "11.25.0"

  fixture_root="$PWD/src/tests/fixtures/parser-generated"
  fixture_repro_dir="$(mktemp -d "$fixture_root/reproduce.XXXXXX")"
  trap 'rm -rf -- "$fixture_repro_dir"' EXIT
  cp -R "$fixture_root/inputs/." "$fixture_repro_dir/"

  (
    cd "$fixture_repro_dir/npm"
    npm install --package-lock-only --lockfile-version 3 --offline \
      --ignore-scripts --no-audit --no-fund \
      --cache "$fixture_repro_dir/npm-cache"
  )
  (
    cd "$fixture_repro_dir/pnpm"
    pnpm install --lockfile-only --offline --ignore-scripts \
      --store-dir "$fixture_repro_dir/pnpm-store"
  )

  cmp "$fixture_root/npm-package-lock.json" \
    "$fixture_repro_dir/npm/package-lock.json"
  cmp "$fixture_root/pnpm-lock.yaml" \
    "$fixture_repro_dir/pnpm/pnpm-lock.yaml"
)
```

Successful `cmp` commands produce no output. npm writes lockfile format 3; pnpm
11.25.0 writes lockfile format 9 for this input. There are no registry dependencies
to download.

## Fixture checksums

| Output | SHA-256 |
| --- | --- |
| `npm-package-lock.json` | `07af9e342fa0b6512526a0ab9cf4cfa4973308acbd2aebe219db057f0567b3e8` |
| `pnpm-lock.yaml` | `2d61db8460c5af7643c59fac1e0f091adf0c1c4455c12b1c2b1ed7fc97691a00` |
