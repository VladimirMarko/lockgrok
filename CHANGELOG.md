# Changelog

## 0.1.0

- Remove the prerelease suffix and the private package flag to permit npm publication.

## 0.1.0-next.0

First pre-release of `lockgrok`, an independent project derived from
`diff-package-lock`. Available from source or a local tarball; npm publication
remains disabled. Original lockgrok contributions are licensed under ISC;
third-party material retains its own terms.

- Compare npm lockfile formats 1, 2, and 3 and pnpm formats 5.4, 6.x, and 9.x
  from Git revisions or explicit files.
- Follow declared consumers through npm hoisting, workspace links, and pnpm peer
  snapshots, with conservative version-inventory matching where needed.
- Display configurable tables with upgrade/downgrade direction, version steps,
  dependency context, scope, and summaries.
- Filter by package, workspace, or scope; inspect complete version inventories,
  retained versions, consumer references, and matching evidence.
- Emit JSON row arrays or detailed reports, with optional change-sensitive exit
  codes for CI.
- Expose an Effect-based parser, pure comparison and rendering functions, and
  TypeScript types through a native ESM package supporting Node.js 22.13+.
- Provide automated tests, strict TypeScript and Biome checks, and reproducible
  SVG/PNG previews generated from CLI output.

See [README.md](README.md) for usage, [Testing](docs/testing.md) for validation,
and [NOTICE.md](NOTICE.md) for provenance.
