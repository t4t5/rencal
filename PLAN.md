# Theme plugins implementation plan

Implement theme packages as the first slice of renCal's plugin system. A theme
package is a manifest plus CSS, published as a GitHub repository. Installing one
never requires JavaScript, a build step or a native executable.

This follows [Theme plugins.md](</home/t4t5/Documents/wiki/ren/renCal/Plugin system/Theme plugins.md>)
and [Plugin system plan.md](</home/t4t5/Documents/wiki/ren/renCal/Plugin system/Plugin system plan.md>).
Ship the shared package infrastructure and themes before Proton. View/command
registries, the JavaScript runtime, provider support, enablement toggles, plugin
assets and deep links are separate, later work.

The guiding model is Obsidian themes (a manifest and a stylesheet fetched from a
tagged release, no CSS validation) and herdr plugins (GitHub topic, manifest in
the repo root, auto-indexed, no review queue). A plugin theme is an external theme
with a manifest. Everything cut from this plan comes back with JS plugins, where
it is actually needed.

## Scope and decisions

- One manifest, `rencal-plugin.toml`, shared with the wider plan. Theme
  contributions are `[[contributes.themes]]`, loaded directly from the manifest.
- Package CSS is the same bare custom-property block as built-in and local themes.
  No parser, no grammar allowlist. CSP blocks every remote resource load a theme
  could attempt, and a brace escape can only restyle the app, which the documented
  nested-selector escape hatch already allows.
- Install fetches the manifest and the CSS files it names, raw, at the release
  tag. No archive download or extraction, so no path confinement, symlink or
  archive checks.
- `plugins.toml` records `id`, `repo` and `version`. No commit locks.
- No enable/disable for themes: selecting a theme is enabling it. No icons, no
  `rencal-plugin://` protocol, no `path =` linking, no reserved `data/`, no
  `api_version` or `platforms` gates, no website deep link in this slice.
- Built-in themes, Omarchy and `~/.config/rencal/themes/*.css` are unchanged.
  Their IDs and selected-theme settings do not migrate. The loose-CSS folder
  remains the author workflow: write CSS there, see it live, then add a manifest
  and publish.

## Starting point

| Existing code                                   | Reuse or change                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src-tauri/src/external_themes.rs`              | Extend `ExternalTheme` with a source and declared appearance; scan the plugin directory too.        |
| `src/themes/ThemeRegistry.tsx`                  | Already injects and reconciles scoped styles per window; map plugin source onto descriptors.        |
| `src/themes/manifest.ts`, `appearance.ts`       | Resolve declared appearance from the registry descriptors, not only the built-in list.              |
| `src/hooks/useTheme.ts`                         | Unchanged: string IDs, TOML selection, background cache, unknown-ID fallback already cover removal. |
| `src/components/settings/themes/ThemesPage.tsx` | Palette tiles already render any descriptor; plugin themes appear automatically.                    |
| `src-tauri/src/routes/themes.rs`, `state.rs`    | Add a `plugins` route alongside; mutations run through the same typed error/event bridge.           |
| `website/src/pages/themes.astro`                | Keep the playground and CSS export; link to Browse and publishing docs.                             |

## Package and storage contract

Example repository:

```text
rencal-plugin.toml
theme.css
README.md
```

```toml
id = "alice.dusk"
name = "Dusk"
version = "1.0.0"
description = "A quiet dark theme for renCal"
min_rencal_version = "0.8.0"

[[contributes.themes]]
id = "dark"
name = "Dusk Dark"
css = "theme.css"
appearance = "dark"                      # required: light | dark
```

```css
--background: #15171c;
--foreground: #e6e6eb;
--hover-tint: #ffffff;
--primary: #a897dc;
--highlight: var(--primary);
```

The registered theme ID is `alice.dusk/dark`. A package may contribute any number
of independently selectable themes, including light and dark variants. `appearance`
describes each contribution; it does not restrict selection or automatically follow
the system appearance. Names and appearance come from the manifest, not CSS comments.

Manifest rules:

- `id` is lowercase `<github-owner>.<name>`; `rencal.*` is reserved for built-ins.
  Contribution IDs are lowercase `[a-z0-9-]` and unique within the package.
- `version` is a semantic version and the release tag equals it, with an optional
  leading `v`. `min_rencal_version` is compared with the running app version,
  accounting for the repository's placeholder `0.0.1` during development.
- `css` paths are relative, within the repository, no `..` or leading `/`.
- Manifests declaring `[app]`, `[provider]` or other contributions are rejected
  with an explicit unsupported-package error. Never install part of a mixed package.
- The indexer matches the owner half of `id` against the repository owner,
  case-insensitively.

Storage:

```text
~/.config/rencal/plugins.toml
~/.local/share/rencal/plugins/alice.dusk/
  rencal-plugin.toml
  theme.css
```

```toml
[[plugins]]
id = "alice.dusk"
repo = "alice/rencal-dusk"
version = "1.0.0"
```

`plugins.toml` is dotfiles-friendly: an entry without `version` is resolved to
the latest release and written back on first install. At startup, any declared
entry with no package directory is installed; failures are reported per package
and do not affect installed themes. Uninstall removes the entry and the directory.
An invalid `plugins.toml` is reported, never replaced with defaults.

## 1. Manifest, scanning and registry

- Add a Tauri-free `src-tauri/src/plugins/` module: manifest parsing/validation,
  `plugins.toml` load/save, package directory scanning. The indexer reuses the
  validator so there is one manifest contract.
- Extend `ExternalTheme` with `source: Loose | Plugin { id, version }` and
  `appearance: Option<Appearance>`. `scan()` returns loose themes plus every
  contribution from every valid package. Per-package errors travel in the same
  snapshot so Settings can show them.
- Watch the plugin directory with the existing `watch_debounced` alongside the
  loose-themes folder. Re-emit the combined list on change, as today.
- Frontend: `ThemeDescriptor` gains `source: "plugin"`; `getDeclaredAppearance`
  reads the registry instead of the built-in list. Nothing else in
  `ThemeRegistry.tsx` or `useTheme.ts` needs to change.
- Set `data-appearance` from the declared appearance for plugin themes; keep
  background inference for Omarchy and loose themes.

**Done when:** a package directory placed by hand shows up in Settings → Themes
with the right name and appearance, hot-reloads on edit, and an invalid package
reports an error without hiding other themes.

## 2. CSP

Required before any downloaded CSS is applied, and overdue regardless.

- Replace `csp: null` in `tauri.conf.json` with a policy that permits bundled
  scripts, IPC, inline styles and local images/fonts, and denies remote style,
  font and image loads, objects and frames. Keep dev/HMR allowances in the dev
  policy and keep `withGlobalTauri` off.
- Move the early theme-restore script out of `index.html` into a bundled file, or
  retain it through Tauri's script hash support. Verify it still runs before
  first paint.
- Keep inserting theme text through `textContent` and escaping generated
  selectors, as `ThemeRegistry.tsx` already does.

**Done when:** both windows work under the production policy and a theme
containing `url(https://…)` produces no network request.

## 3. Install, update, uninstall

- `api.plugins.inspect(repo)`: accept `owner/repo`, resolve the latest stable
  GitHub release, fetch `rencal-plugin.toml` at that tag, validate and return
  name, version, theme names and compatibility for the install review.
- `api.plugins.install(repo)`: fetch the manifest and each `css` file raw at the
  tag, validate, write to a temp directory, rename into place, then append or
  update the `plugins.toml` entry. Bound file sizes. Never execute repository
  content.
- Update is install with a newer version; the old directory stays until the new
  one is complete. Uninstall deletes the directory and the entry. Serialize
  mutations and write `plugins.toml` atomically.
- Installing never changes the selected theme. Removing the selected theme falls
  back to core defaults through the existing unknown-ID path and keeps the saved
  ID, so reinstalling restores it.
- Report network, rate-limit, missing-release, incompatibility and invalid
  manifest errors per package. Installed themes work offline.

**Done when:** install survives restart, `plugins.toml` on a second machine
restores the same themes, and a failed update leaves the old theme in place.

## 4. Settings page

- Add Settings → Plugins with Installed, Browse and an `owner/repo` install box.
  Installed rows show name, owner, version, a Theme badge, an Update action when
  the catalog has a newer version, errors and Uninstall.
- The install review shows repository, version, theme names, compatibility and
  a note that listings are unreviewed community packages. Selecting the theme
  remains in Settings → Themes.

**Done when:** a theme can be installed, updated and uninstalled from Settings
without restarting or changing the current selection.

## 5. Index and website

- Add a scheduled/manual indexer workflow for the `rencal-plugin` GitHub topic.
  For each repository read the root manifest at the latest stable release,
  validate with the shared validator and owner rule, and record repo,
  description, version, tag, release date, stars and contribution badges.
  Never build or execute repositories; do not fetch READMEs.
- Write one `plugins.json`, deployed by the website workflow to
  `rencal.org/plugins.json`. The app fetches it for Browse and update checks.
  Keep the last good index on failure.
- Website `/plugins` lists the index with a Theme filter, author, version, sort
  by stars, updated and name, and an install hint (`owner/repo` to paste into
  Settings). Link the `/themes` playground to it and to publishing docs.
- Docs: update `src/themes/README.md` and `website/src/content/docs/docs/themes.md`
  with a minimal sample package, the manifest fields, namespacing, and the
  publish steps: add the manifest, add the topic, tag a release matching `version`.

**Done when:** an author can publish a CSS repository and release, see it on
`rencal.org/plugins`, and install it from Settings by name.

## Validation and delivery

Deliver the numbered sections in order as reviewable changes. Steps 1–2 make
hand-placed packages work; 3–5 complete the installable plugin type.

- Rust tests: manifest/version/owner/ID validation, `css` path rules,
  unsupported-package rejection, `plugins.toml` round-trip and malformed input,
  scan with mixed valid/invalid packages, install/update with fixture HTTP
  responses and temp directories.
- Frontend tests: descriptor merge, declared appearance, style cleanup on
  removal, selected-theme fallback and restore.
- Indexer fixtures: matching tags, mismatched owners, unsupported packages,
  malformed manifests, last-good output on network errors.
- Webview checks: production CSP in both windows, zero external requests from a
  theme with `url()`, early background restore, existing Omarchy/local themes.
- Regenerate with `just gen-types`; run `just check`, `just test` and
  `pnpm --dir website build`. Smoke-test release builds on Linux and macOS,
  including install and uninstall while offline.

Later slices add on top without changing manifests, IDs or catalog URLs:
enablement in `config.toml` and the `rencal-plugin://` asset protocol with JS
plugins, provider binaries with their registration stage, website deep links.
