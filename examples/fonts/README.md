# Preview fonts

These unmodified **DejaVu Sans Mono 2.37** fonts make preview generation
independent of fonts installed on the developer's computer or CI runner. The
preview renderer explicitly loads these files and disables system font loading.

The files were copied byte for byte from the installed `fonts-dejavu-core`
package at `/usr/share/fonts/truetype/dejavu/`. Both fonts' internal version
records report `Version 2.37`.

- Upstream: <https://dejavu-fonts.github.io/>
- Upstream source: <https://github.com/dejavu-fonts/dejavu-fonts>
- Upstream license: <https://dejavu-fonts.github.io/License.html>
- Included license: [LICENSE](LICENSE), containing the Bitstream Vera and Arev
  notices and the statement that DejaVu changes are in the public domain.

## SHA-256 checksums

```text
c805f9436dbc268644c1d9584f01a601a653e028e08fd74b9b949f6cf8304d88  DejaVuSansMono.ttf
3a3c502eeff669a231549e80df9f7c49de109bafe303170409e905d0b31a38fe  DejaVuSansMono-Bold.ttf
```

To verify the assets from this directory:

```sh
sha256sum DejaVuSansMono.ttf DejaVuSansMono-Bold.ttf
```

Keep both fonts and their license together. Changing a font is an intentional
preview-rendering change and requires regenerating the SVG and PNG artifacts.
