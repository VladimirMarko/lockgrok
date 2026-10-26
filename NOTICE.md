# Provenance

`lockgrok` began from
[diff-package-lock](https://github.com/adiktofsugar/diff-package-lock). The upstream
package metadata names Sean McCollum as author and declares ISC.

The starting revision was
`a07534261f6ff76b397eb49ee1775d0a94643867`. The original package name and upstream
URLs in this notice identify that source. They do not identify the publisher or
repository of `lockgrok`.

At that revision, a standalone upstream LICENSE file was not present.
[third-party-notices/diff-package-lock.txt](third-party-notices/diff-package-lock.txt)
records the upstream metadata and includes standard ISC permission and disclaimer
text as a reference. It is not presented as a copied upstream copyright notice
or as a new license grant for the replacement implementation.

The package and command are named `lockgrok`. This project is independently
maintained and does not represent or claim endorsement by any upstream author.
Package metadata identifies lockgrok's own repository and omits the upstream
author field. Original lockgrok contributions are licensed under [ISC](LICENSE);
third-party material retains its own terms. The package metadata permits npm
publication. See [LICENSE-STATUS.md](LICENSE-STATUS.md) for scope and the
maintainer's publication decision.

## Bundled preview fonts

The source archive includes DejaVu Sans Mono 2.37 regular and bold fonts for
deterministic preview generation. Their copyright and license notices are
preserved in [examples/fonts/LICENSE](examples/fonts/LICENSE). The font version,
source, and file hashes are recorded in
[examples/fonts/README.md](examples/fonts/README.md).

These paths refer to the source checkout. The npm package excludes the fonts
and their documentation. Its SVG preview references the font family by name
and does not embed font data.

## Development skills

The source checkout includes locally maintained skills installed through the
skills CLI and copied from another project. Sources, installation hashes,
modifications, and license evidence are recorded in
[skills provenance](.agents/skills/PROVENANCE.md). Matt Pocock and HumanLayer
copyright notices are preserved under `third-party-notices/`. The no-ai-slop
fork's [permission record](third-party-notices/no-ai-slop.txt) documents the
author's quoted invitation and the maintainer's acceptance of it for publication.
These authors are credited as upstream sources, not as lockgrok maintainers.
