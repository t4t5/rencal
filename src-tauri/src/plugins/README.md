# Plugins

renCal plugins contribute CSS themes and calendar providers. Themes are data. A provider is a program: renCal downloads a `caldir-provider-<slug>` binary from the plugin's GitHub release and runs it to sync accounts, with the user's permissions.

A plugin is a GitHub repository with a `rencal-plugin.toml` manifest and its contributed files:

```toml
id = "alice.dusk"
name = "Dusk"
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

A theme is listed under its appearance's slot in settings; ship a light and a dark theme to give users a pair.

Fonts are shared by every theme in a package and must use WOFF2. `weight` defaults to `400` and `style` to `normal`; theme CSS should include suitable fallback fonts.

For catalog inclusion, give the repository the `rencal-plugin` GitHub topic and use a plugin ID whose owner matches the repository owner. Manifests have no version: a plugin is versioned by where renCal installs it from. A stable GitHub release is optional for theme plugins. If one exists, renCal installs the latest release and shows its tag; otherwise it installs the head of the default branch and shows the short commit. Publish a release, or push to the default branch of an unreleased theme, to ship an update.

## Calendar providers

A provider plugin lives in the provider's own repository, so one release tag covers both the binary and the manifest:

```toml
id = "t4t5.tuta"
name = "Tuta"
description = "Sync your Tuta calendars with renCal"
min_rencal_version = "0.8.0"

[[contributes.providers]]
slug = "tuta"
name = "Tuta"
icon = "icons/tuta.svg"
bin = "caldir-provider-tuta-{target}.tar.gz"
```

- `slug` is the caldir provider slug, not a plugin-local ID: the binary is `caldir-provider-<slug>`, accounts store it as their provider, and the provider's sessions live in `~/.config/caldir/providers/<slug>`. It uses lowercase `a-z`, `0-9` and hyphens. `google`, `icloud`, `outlook`, `caldav` and `webcal` are reserved, and only one installed plugin may contribute a slug.
- `name` is shown in **Settings → Accounts**.
- `icon` is optional: a relative `.svg` path in the repository, at most 64 KiB. Without one, renCal shows a generic calendar icon.
- `bin` is the file name of the release archive holding the binary. It contains `{target}` exactly once and ends in `.tar.gz`. renCal fills in its platform's targets in order and takes the first asset the release has:
  - Linux x86_64: `x86_64-unknown-linux-musl`, `x86_64-unknown-linux-gnu`
  - Linux aarch64: `aarch64-unknown-linux-musl`, `aarch64-unknown-linux-gnu`
  - macOS: `aarch64-apple-darwin` or `x86_64-apple-darwin`

  The archive must hold a regular file named `caldir-provider-<slug>` at its root or inside one top-level directory. Everything else in it (README, license, helper binaries) is ignored. Archives may be up to 64 MiB.

Provider plugins must be published as a stable GitHub release; the default-branch fallback does not apply. The release tag is the plugin version, so a Rust provider keeps its only copy in `Cargo.toml`. The manifest and icon come from the release commit, and the binary from the release's assets. Every asset needs GitHub's `sha256` digest: renCal verifies the download against it and records it in `plugins.lock`, so a restore installs the same bytes or fails. A release without an asset for the user's platform installs the plugin's themes only, or nothing if it has none.

Installed provider plugins look like this:

```
~/.local/share/rencal/plugins/t4t5.tuta/
├── rencal-plugin.toml
├── icons/tuta.svg
└── bin/caldir-provider-tuta
```

The binary is registered with renCal only, never put on `PATH`. When several binaries share a slug, renCal prefers its bundled providers, then plugins, then `PATH`. The caldir CLI and other caldir clients therefore cannot sync these accounts; **Settings → Accounts** says so unless a `caldir-provider-<slug>` is also on `PATH`. Uninstalling removes the binary but never touches caldir configuration, provider sessions or calendar data, so installing the provider on `PATH` afterwards keeps the account working without signing in again.

In a local checkout, renCal runs `bin/caldir-provider-<slug>` from the checkout if it exists, so a developer can symlink their build output there. Without it, the plugin contributes only the name and icon, and the binary comes from `PATH`.

The catalog only lists a provider when its release has at least one matching asset with a digest, and labels such plugins as calendar providers.

Declare installed plugins by repository in `~/.config/rencal/plugins.toml`:

```toml
plugins = [
  "alice/rencal-dusk",
  "~/dev/rencal-dusk",
]
```

This list is authoritative and reloads while renCal is running. Adding a repository installs it,
without the review screen that the plugin directory opens: the user wrote the declaration. Removing
one deletes the package and its lock entry. Manually placed package directories that have
no lock entry, including symlinked development checkouts, are left alone.

An absolute path or a path beginning with `~/` declares a local checkout. The checkout must contain
a valid `rencal-plugin.toml`. renCal links it into `~/.local/share/rencal/plugins/<manifest-id>` so
theme edits reload immediately. When a local checkout has the same plugin ID as a repository entry,
the checkout takes precedence; removing its path restores the repository at its locked commit.
Relative paths are rejected because a symlinked `plugins.toml` has no unambiguous working directory.

renCal resolves the selected release or branch head to a commit SHA before downloading files. Resolved IDs, release tags, and commits are kept in the internal data file `plugins.lock`, alongside the installed `plugins/` directory, so missing package files can be restored from the same source revision without exposing generated metadata in user configuration.

Users normally install a plugin with the **Install in renCal** button on the [plugin directory](https://rencal.org/plugins), which opens the package in **Settings → Plugins** for review before anything is installed.

On Linux, `rencal plugin install owner/repository` remains available for terminal use and dotfiles.

## Plugin previews

Optionally add one file named exactly `preview.png` at the repository root. No manifest field is needed. A landscape image with a 16:9 aspect ratio is recommended; other dimensions are fitted without stretching or cropping. For a theme with dark and light variants, combine both in this single image.

The catalogue accepts actual PNG files up to 10 MiB and 20 megapixels decoded. It generates a static, metadata-free thumbnail with a maximum dimension of 960 pixels, preserving the aspect ratio without upscaling. Missing, invalid, oversized, or unavailable previews show a placeholder and do not prevent listing or installation. Preview images are catalogue assets and are not downloaded as part of an installed plugin.
