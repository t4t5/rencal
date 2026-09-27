# Theme system plan: light/dark variants

## Goal

Let a theme ship both a light and a dark variant, and show the one that matches the OS appearance. Users still choose one theme from one grid. A theme with both variants switches by itself; a light-only or dark-only theme looks the same whatever the OS does.

This replaces the Fantastical-style model (one theme slot for light mode, one for dark) that we considered first. Reasons:

- **One choice, one grid.** No tab UI and no pair of slots to explain.
- **Omarchy already fits.** `omarchy` is a theme whose appearance is decided at runtime (`appearance: null` in `src/themes/manifest.ts`). "Follow the system" becomes something a theme does, not a separate setting.
- **Single-appearance themes don't change.** Tokyo Night stays dark whatever the OS does, which is what someone who picks it expects.
- **Same behaviour on every platform.** macOS, Windows and GNOME/KDE users get automatic switching from themes with both variants. Omarchy users mostly choose `omarchy` and never notice.
- **The ecosystem already works this way.** The Gruvbox plugin has both variants. Zed, Ghostty and Neovim colorschemes use the same model.

**What we give up:** you can't pair two unrelated themes (Ren at night, Minimal Light by day). That's a niche case, and plugin authors can publish matched pairs.

## User-facing behaviour

- The Themes grid shows one card per theme. A card for a theme with both variants shows its preview split diagonally, light half and dark half, so it's clear the theme switches.
- When the selected theme has both variants, an **Appearance: Auto / Light / Dark** control appears under the grid. It defaults to Auto, which follows the OS. Light or Dark pins that variant. The control is hidden for themes with only one variant, and for `omarchy` (see Decisions).
- The appearance preference is global, not per theme. It only applies to themes with both variants, and switching themes keeps it.

## Core idea: appearance selects the variant

The app already sets `data-appearance` on `<body>` and on preview tiles, and CSS already reads it (`dark:` variants, event-text defaults). The variant can be chosen with the same attribute:

```css
[data-theme="gruvbox"][data-appearance="light"] {
  /* light.css */
}
[data-theme="gruvbox"][data-appearance="dark"] {
  /* dark.css */
}
```

Why this works:

- **Stable ids.** The theme id doesn't depend on the variant, so config, `theme-bootstrap.js` and cross-window sync keep storing one string.
- **Previews come for free.** A preview tile renders a given variant by setting `data-appearance` on its scope, which `ThemePreview` already does.
- **The baseline still wins where it should.** Both selectors are more specific than the `:root, [data-theme]` baseline in `src/global.css`, so the baseline's resets apply first.

Today appearance is an _output_: each theme declares or derives it. For themes with both variants it becomes an _input_:

| Theme kind                                     | Resolved appearance                                          |
| ---------------------------------------------- | ------------------------------------------------------------ |
| Both variants (`"both"`)                       | preference is `auto` ? system appearance : preference        |
| Fixed (`"light"` / `"dark"`)                   | the declared value                                           |
| Runtime (`null`: `omarchy`, loose single-file) | Omarchy's `mode`, or computed from `--background` (as today) |

## Implementation

### 1. Plugin manifest contract (`src-tauri/plugin-contract`)

Allow either form in `[[contributes.themes]]`:

```toml
# Single variant (unchanged)
[[contributes.themes]]
id = "dark"
name = "Dusk Dark"
css = "theme.css"
appearance = "dark"

# Both variants (new)
[[contributes.themes]]
id = "gruvbox"
name = "Gruvbox"
light = "themes/light.css"
dark = "themes/dark.css"
```

- **`ThemeContribution` struct:** change it to hold `css: Option<String>`, `appearance: Option<Appearance>`, `light: Option<String>` and `dark: Option<String>`. `validate_manifest` accepts exactly one of `css` + `appearance` or `light` + `dark`, and rejects mixes and half-pairs with clear messages. Expose the result as an enum (for example `ThemeVariants::Single { css, appearance }` / `ThemeVariants::Both { light, dark }`) so later code never deals with the invalid combinations.
- **Path checks:** run the existing path validation (the `../`, absolute and backslash checks in the plugins tests) on `light` and `dark` too.
- **Older renCal versions:** they reject a manifest without `css`. Plugins using the new form must raise `min_rencal_version` to the release that ships this. The existing "requires renCal X" check (see `tolerates_future_metadata_and_reports_newer_version_first`) then gives a clear error instead of a parse error, and the catalog already filters on `min_rencal_version`.
- **Plugin indexer (`src-tauri/plugin-indexer`):** it goes through `validate_manifest`, so it picks this up. Add a test that indexes a plugin with both variants.

### 2. Scanning (`src-tauri/src/plugins/mod.rs`, `src-tauri/src/external_themes.rs`)

- **`ScannedTheme`:** carries the variants enum and reads one CSS file or two.
- **`ExternalTheme`:** replace `css` + `appearance` with a tagged enum that specta exports:

  ```rust
  #[serde(tag = "kind", rename_all = "snake_case")]
  pub enum ExternalThemeCss {
      Single { css: String, appearance: Option<Appearance> },
      Both { light: String, dark: String },
  }
  ```

- **Loose themes in `~/.config/rencal/themes/`:** pair them by file name.
  - `gruvbox.light.css` + `gruvbox.dark.css` become `user:gruvbox` with both variants. The name comes from `@name` in either file, falling back to the stem without the suffix.
  - A lone `foo.light.css` or `foo.dark.css` becomes a single theme with a declared appearance (a small improvement on today's luminance guess).
  - If `foo.css` exists alongside a `foo.*.css` pair, the pair wins, and the snapshot reports an error about `foo.css`.
  - Update the README written by `write_readme` to describe this.
- **Plugin install review:** `installer.rs` (`PluginThemeInspection`) needs the same shape so the review screen can list both variants.
- **Bindings:** run `just gen-types`.

### 3. Appearance preference (`src-tauri/rencal-config`, `src-tauri/src/routes/config.rs`)

- **Config:** add `theme_appearance: ThemeAppearance` (`auto | light | dark`) to `RencalConfig`, with `#[serde(default)]` = `Auto` so existing `config.toml` files load unchanged.
- **RPC:** add `get_theme_appearance` / `set_theme_appearance`, following the pattern of `get_first_day_of_week` / `set_first_day_of_week`.

### 4. Frontend descriptors (`src/themes/manifest.ts`, `src/themes/external.ts`)

- **`ThemeDescriptor.appearance`:** widen it to `Appearance | "both" | null`. `externalThemeDescriptor` maps `Both` to `"both"`.
- **Rename:** replace `getDeclaredAppearance` with `resolveAppearance(id, descriptors, { preference, system })`, which implements the resolution table above. The `null` case keeps calling `appearanceFromComputedBackground()` from `appearance.ts`.
- **`applyExternalThemes`:** for `Both`, write two rules into the same `<style>` element, one per variant, with the `[data-theme][data-appearance]` selectors shown above. Keep the rule that only the selected theme's CSS is injected (the wrapper isn't a security boundary).
- **`externalThemePalette(css)`:** unchanged. The preview calls it once per variant.

### 5. Built-in themes (`vite-plugin-rencal-themes.ts`, `src/themes/`)

- **File names:** `name.css` keeps its current meaning. `name.light.css` and `name.dark.css` are wrapped as `[data-theme="name"][data-appearance="…"]`. Make the Vite plugin strip the variant suffix when it derives the id.
- **Manifest entries:** register built-ins with both variants as `appearance: "both"` in `manifest.ts`.
- **Test:** update `manifest.test.ts` (or add one) to check that every `"both"` entry has both files and every fixed entry has `name.css`.

### 6. Detecting the system appearance

There's a trap here. `useTheme` calls `getCurrentWindow().setTheme(appearance)`, which **forces** the window's appearance. While it's forced, the window's `theme()`, `onThemeChanged` and the webview's `prefers-color-scheme` report the forced value, not the OS setting.

The fix is to force the window only when the resolved appearance didn't come from the system:

- **Both variants + Auto:** call `setTheme(null)` so the window follows the OS, then read `getCurrentWindow().theme()` and subscribe to `onThemeChanged`. In this state nothing forces the window, so both report the real OS value.
- **Everything else:** keep calling `setTheme(resolved)` so the window chrome matches the theme.

Put this in a small `useSystemAppearance()` hook that `useTheme` uses. Only subscribe when it's needed.

**Omarchy:** I don't know yet whether Omarchy updates the desktop portal's `color-scheme` when you switch themes (for example via `gsettings … color-scheme`). If it does, the approach above works unchanged. If it doesn't, use the Omarchy watcher's `mode` (`light.mode`, already in `OmarchyColors`) as the system appearance when Omarchy is detected. `useOmarchyTheme` already receives it on every change. Check this before shipping; step 1 of the rollout covers it.

### 7. `useTheme` changes (`src/hooks/useTheme.ts`)

- **State:** add a `themeAppearance` value next to `theme`, using the same localStorage cache + TOML reconciliation + `theme-changed` cross-window pattern. Either a second event (`theme-appearance-changed`) or change the event payload to `{ theme, appearance }`. The second event is the smaller change.
- **Main effect:** compute `resolved = resolveAppearance(...)`, set `document.body.dataset.appearance = resolved` _before_ `applyExternalThemes` (the variant CSS depends on it), then decide whether to force the window as described in step 6.
- **Background cache:** the `themeBackground` cache effect also needs to rerun when the resolved appearance changes.
- **`toggleTheme`:** unchanged. It cycles theme families.

### 8. Flash prevention (`public/theme-bootstrap.js`)

Cache the last resolved appearance in localStorage (`themeAppearanceResolved`) and set `document.body.dataset.appearance` from it before first paint, next to `data-theme`. The existing `themeBackground` cache already covers the background colour.

If the OS switched while renCal was closed, the first frame can use the old variant until React runs. That's acceptable. If it turns out to be visible, the bootstrap can check `matchMedia("(prefers-color-scheme: dark)")` when the cached preference is `auto` and the cached theme is marked as having both variants.

### 9. Settings UI (`src/components/settings/themes/ThemesPage.tsx`)

- **`ThemePreview`:** for `"both"` themes, render two stacked scopes clipped diagonally (for example with `clip-path`), one with `data-appearance="light"` and one with `data-appearance="dark"`. External previews pass `externalThemePalette(variant.css)` for each variant.
- **Appearance control:** under the grid, show a segmented **Auto / Light / Dark** control (reuse existing UI primitives) when the selected theme's descriptor is `"both"`. In Auto, label the current OS value, for example "Auto (Dark)".

### 10. Docs

- `src/themes/README.md`: variant files and the new selector form.
- `src-tauri/src/plugins/README.md`: the `light` / `dark` manifest form and the `min_rencal_version` requirement.
- `website/src/content/docs/docs/themes.md`: the loose `name.light.css` / `name.dark.css` pairing and the Appearance control.

## Rollout order

1. **Test Omarchy (step 6).** Switch between a light and a dark Omarchy theme and check whether Tauri's `onThemeChanged` fires with the window theme set to `null`. The result decides which system-appearance source `useSystemAppearance` uses on Omarchy.
2. **Contract, scanning, config, bindings** (steps 1–3), with Rust tests: parsing both manifest forms, rejecting mixed or half-pair forms, loose-file pairing and the collision error.
3. **Frontend resolution and injection** (steps 4, 6, 7, 8), with tests for `resolveAppearance` and for the two-rule `applyExternalThemes` output (extend `external.test.ts`).
4. **Settings UI** (step 9).
5. **Built-in variants and the Gruvbox plugin.** Move Gruvbox to the new manifest form. Optionally add variant pairs for built-ins (Tokyo Night Day/Night, Catppuccin Latte/Mocha). Renaming an existing built-in id (for example `catpuccin-latte` → `catppuccin`) needs an alias in `useTheme`'s TOML reconciliation so saved configs keep working. Adding new ids avoids that.
6. **Docs** (step 10). Run `just check` and `just test`.

## Decisions

- **The appearance preference is global.** It is one value in `config.toml`, not stored per theme. It only affects themes with both variants.
- **`omarchy` has no Light/Dark pin.** Omarchy knows whether its current theme is light or dark, but users choose Omarchy themes as whole themes, not by appearance. renCal only uses that mode to set `data-appearance` and the window chrome, and the Appearance control stays hidden while `omarchy` is selected.
