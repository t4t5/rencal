# Plugins

renCal plugins are data-only packages that currently contribute CSS themes. Executable plugin code is not supported.

A plugin is a GitHub repository with a `rencal-plugin.toml` manifest and its contributed files:

```toml
id = "alice.dusk"
name = "Dusk"
version = "1.0.0"
description = "A quiet dark theme for renCal"
min_rencal_version = "0.8.0"

[[contributes.fonts]]
family = "Pixelated MS Sans Serif"
file = "fonts/ms_sans_serif.woff2"

[[contributes.fonts]]
family = "Pixelated MS Sans Serif"
file = "fonts/ms_sans_serif_bold.woff2"
weight = 700

[[contributes.themes]]
id = "dark"
name = "Dusk Dark"
css = "theme.css"
appearance = "dark"
```

Fonts are package-level contributions shared by every theme in the package. Only WOFF2 is supported. `weight` defaults to `400`, `style` defaults to `normal`, and the accepted styles are `normal`, `italic`, and `oblique`. A package may declare at most eight distinct `(family, weight, style)` faces. Font families are limited to 100 characters; font and CSS files must use safe relative package paths.

Each CSS or font file is limited to 1 MiB, and the manifest plus all contributed files share a 4 MiB package download limit. renCal verifies the WOFF2 signature both during installation and before use. Declared files are downloaded from the package's pinned commit, installed atomically, and restored from that exact commit when missing, so selected themes remain usable offline.

Fonts are loaded lazily only while one of their package's themes is selected. Theme CSS should always retain suitable fallbacks:

```css
--font-body: "Pixelated MS Sans Serif", Arial, sans-serif;
--font-heading: "Pixelated MS Sans Serif", Arial, sans-serif;
--font-button: "Pixelated MS Sans Serif", Arial, sans-serif;
--font-numerical: "Pixelated MS Sans Serif", Arial, sans-serif;
```

Plugin authors are responsible for the right to redistribute bundled fonts and for including all required font license and attribution notices in their repository. Set `min_rencal_version` to `0.8.0` or later when using `contributes.fonts`; older releases reject this contribution instead of silently ignoring it.

For catalog inclusion, give the repository the `rencal-plugin` GitHub topic and use a plugin ID whose owner matches the repository owner. A stable GitHub release is optional. If one exists, its tag must match the manifest version (`1.0.0` or `v1.0.0`); otherwise renCal uses the head of the default branch. Bump the manifest version to publish an update.

Declare installed plugins by repository in `~/.config/rencal/plugins.toml`:

```toml
plugins = [
  "alice/rencal-dusk",
]
```

This list is authoritative and reloads while renCal is running. Adding a repository installs it;
removing one deletes the package and its lock entry. Manually placed package directories that have
no lock entry, including symlinked development checkouts, are left alone.

renCal resolves the selected release or branch head to a commit SHA before downloading files. Resolved IDs, versions, and commits are kept in the internal data file `plugins.lock`, alongside the installed `plugins/` directory, so missing package files can be restored from the same source revision without exposing generated metadata in user configuration.

Users normally install a plugin with the **Install in renCal** button on the [plugin directory](https://rencal.org/plugins), which opens the package in **Settings → Plugins** for review before anything is installed.

On Linux, `rencal plugin install owner/repository` remains available for terminal use and dotfiles.

## Plugin previews

Optionally add one file named exactly `preview.png` at the repository root. No manifest field is needed. A landscape image with a 16:9 aspect ratio is recommended; other dimensions are fitted without stretching or cropping. For a theme with dark and light variants, combine both in this single image.

The catalogue accepts actual PNG files up to 10 MiB and 20 megapixels decoded. It generates a static, metadata-free thumbnail with a maximum dimension of 960 pixels, preserving the aspect ratio without upscaling. Missing, invalid, oversized, or unavailable previews show a placeholder and do not prevent listing or installation. Preview images are catalogue assets and are not downloaded as part of an installed plugin.
