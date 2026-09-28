# Theme plan: one theme per appearance

Replace the family model on `dark-light-themes` with Zed's model: the user picks a light theme, a dark theme, and a mode that chooses between them. Families disappear from settings; a plugin package that ships a light and a dark theme is a natural pair, nothing more.

## Model

```toml
[theme]
mode = "system"   # system | light | dark
light = "ren-light"
dark = "ren"
```

- **Mode** picks the slot: `system` follows the OS, `light`/`dark` pin it.
- **Slots** hold any theme id: built-in, `plugin.id:theme`, or `user:<slug>`. Nothing validates a slot against the theme's appearance; the UI steers, hand edits are allowed.
- **Theme appearance** is `light`, `dark`, or `system`. Only Omarchy uses `system`: its mode comes from the Omarchy palette, which Omarchy also applies as the OS color scheme, so it fits either slot. Plugin manifests stay `light | dark` (a theme is one CSS block and can't adapt). Loose user themes get theirs inferred from `--background` once, when the descriptor is built.

Derived state (one pure function, unit-tested):

```ts
activeSlot = mode === "system" ? osAppearance : mode
activeTheme = settings[activeSlot]
followsSystem = mode === "system" && settings.light !== settings.dark
```

**Window theme.** A forced window (`setTheme("dark")`) reports the forced value from `theme()`, `onThemeChanged` and `prefers-color-scheme`, so:

- `followsSystem`: leave the window unforced (`setTheme(null)`) and track the OS with `useSystemAppearance`.
- Otherwise: force the window to the active theme's appearance (Omarchy: its palette mode). With both slots equal the OS doesn't matter, so forcing costs nothing.

One place owns `setTheme` on the window. `useOmarchyTheme` stops calling it and exposes the palette mode instead.

## Defaults and migration

- Default: `mode = "system"`, `light = "ren-light"`, `dark = "ren"`.
- Fresh install with Omarchy detected: both slots `omarchy`.
- Legacy `theme = "x"` (a string) deserializes to `light = dark = "x"`, `mode = "system"`. Every upgraded user sees exactly what they saw before; they opt into a pair in settings. The next save writes the table.
- The branch's `appearance` key never shipped, so no migration for it.
- localStorage: new keys only. The bootstrap may paint the default once after upgrading; TOML reconciliation fixes it on mount.

## Rust

1. `rencal-config/src/lib.rs`
   - Replace `theme: String` + `appearance: AppearanceSetting` with `theme: ThemeConfig { mode: ThemeMode, light: String, dark: String }`.
   - `ThemeMode { System (default), Light, Dark }`.
   - `Deserialize` for `ThemeConfig` accepts a table or a legacy string (`#[serde(untagged)]` helper enum). Always serializes as a table.
   - Check `toml::to_string_pretty` emits `[theme]` after the scalar keys; if it doesn't, move the field to the end of the struct.
   - Tests: default, legacy string, table round-trip, partial table (missing keys fall back to defaults).
2. `src/routes/config.rs`: rename the RPC mirror to `ThemeMode`; `ThemeSettings { mode, light, dark }`; `get_theme`/`set_theme` keep their names and take/return `ThemeSettings`.
3. `src/events.rs`: `ThemeChanged(ThemeSettings)`; update the payload test.
4. `just gen-types`.

## Frontend

### Registry and manifest

- `src/themes/manifest.ts`
  - `Appearance = "light" | "dark"`; `ThemeAppearance = Appearance | "system"`.
  - Omarchy: `appearance: "system"`. Drop `null` from built-ins.
  - `ThemeDescriptor.appearance: ThemeAppearance` (never null).
  - Delete `VARIANT_FAMILIES`, `ThemeFamily`, `getThemeFamilies`, `resolveFamilyTheme`, `hasVariants`.
  - Export `DEFAULT_THEME_SETTINGS` and a `themesFor(slot, descriptors)` helper: themes whose appearance is `slot` or `system`.
- `src/themes/external.ts`: `externalThemeDescriptor` fills a missing appearance with `appearanceFromCss(theme.css)`. Move `appearanceFromCss`/the luminance helpers so `external.ts` and `appearance.ts` don't import each other.
- `src/themes/appearance.ts`: `getActiveAppearance` becomes a lookup (`system` → Omarchy palette mode). `appearanceFromComputedBackground` should become unused; delete it if so.

### Theme controller (fixes the triple `useTheme` instance)

`useTheme` currently runs its effects in every caller (`SettingsWindow`, `ThemesPage`, `GlobalShortcuts`). Move all effects into the provider so they run once per window:

- `ThemeProvider` (`src/themes/ThemeRegistry.tsx`, or a sibling `ThemeController` it renders) owns:
  - settings state: one localStorage key `themeSettings` (zod schema) instead of `theme` + `appearance`;
  - TOML reconciliation on mount (TOML wins) and the fresh-install Omarchy default;
  - the `theme-changed` cross-window listener;
  - `useSystemAppearance(followsSystem)`;
  - applying `data-theme`/`data-appearance`, external CSS and fonts, and the window theme;
  - writing the bootstrap cache.
- `useTheme()` becomes a context read: `{ settings, activeTheme, activeSlot, setSettings, setSlot, setMode, pickTheme, cycleTheme }`.
- Remove the bare `useTheme()` call in `SettingsWindow.tsx`.
- `useSystemAppearance`: keep the last OS appearance it read (don't reset to a possibly forced `matchMedia` value when re-enabled), and replace the `=== false ? "light" : "dark"` default with a plain check.

### Actions

- `setSlot(slot, id)`: settings page picks.
- `setMode(mode)`: the mode control.
- `pickTheme(id)` (command palette, "show me this now"):
  - `system` theme (Omarchy): both slots.
  - Otherwise: fill `settings[appearance]`. If that slot won't be showing (pinned to the other mode, or System with the OS on the other appearance), set `mode` to the theme's appearance.
- `cycleTheme()` (shortcut): next theme in `themesFor(activeSlot)`, written to the active slot.

### Bootstrap cache

- `src/themes/bootstrap-cache.ts`: write `themeSettings` (via the provider's localStorage state) and `themeBackgrounds: { light?: { theme, background }, dark?: { theme, background } }`. Keyed by slot, so it's bounded; an entry only applies when its `theme` matches the slot.
- `public/theme-bootstrap.js`: read `themeSettings`, resolve the slot (`system` → `prefers-color-scheme`, the window being unforced at launch), set `data-theme`, apply the slot's background if the ids match. Drop the legacy `theme` fallback.
- `index.html`: replace `data-default-theme="ren"` with `data-default-light-theme="ren-light"` `data-default-dark-theme="ren"` (or hardcode both in the bootstrap). Keep them in step with `DEFAULT_THEME_SETTINGS`.
- `useOmarchyTheme`: cache Omarchy's background under whichever slot(s) hold `omarchy`.

### Settings page (`ThemesPage.tsx`)

```
Appearance   [ System | Light | Dark ]

(System only)  [ Light theme | Dark theme ]     ← slot tabs, default = active slot

[card] [card] [card]
[card] [card] [card]
```

- The mode control only sets `mode`. Slot tabs only choose which grid is shown. No tab click changes the theme, so the `browsing` state goes away.
- With mode Light or Dark, show that slot's grid alone; the other slot keeps its value.
- A slot's grid is `themesFor(slot)`, plus the slot's current theme if it doesn't fit (legacy or hand-edited configs), so the selection is always visible.
- Picking a card calls `setSlot(slot, id)`.
- Previews: each card shows its one theme. Drop the split System preview. Optionally show the two chosen themes as a small split swatch beside the mode control.
- Keep the `tabs.tsx` nested-orientation fix from this branch.

### Command palette (`GlobalShortcuts.tsx`)

- Items: every descriptor (all themes, not families), `activeId: activeTheme`, `onSelect: pickTheme`.
- `toggleTheme` shortcut → `cycleTheme`.

### API and tests

- `src/lib/api/themes.ts` + `index.ts`: export `ThemeMode`, `ThemeSettings`; drop `AppearanceSetting`.
- Update `contracts.typecheck.ts`, `notifications*.test.ts` and `ThemeRegistry.test.tsx` for the new payload.
- New tests:
  - the pure resolver: `activeSlot`, `activeTheme`, `followsSystem` for equal and different slots;
  - `pickTheme` rules: fixed mode vs System, OS on the other side, Omarchy fills both;
  - `cycleTheme` stays within the active slot's themes;
  - `externalThemeDescriptor` infers appearance for loose themes;
  - the provider applies the theme once however many `useTheme` consumers there are.

## Docs and website

- `src/themes/README.md`: replace "Families and the appearance setting" with a short section on mode + slots, the window-forcing rule, and the bootstrap cache.
- `src-tauri/src/plugins/README.md`: replace "Each theme has one appearance and shows as its own card" with "A theme is listed under its appearance's slot; ship a light and a dark theme to give users a pair."
- `website/src/content/docs/docs/themes.md`: new `[theme]` snippet. Say System is the default everywhere (the branch says "on macOS").
- `website/src/pages/themes.astro`: the Omarchy filter checks `appearance !== "system"` instead of `!== null`, if it reads the app manifest.

## Theme plugins

- `rencal-theme-gruvbox` needs no manifest change: its two themes already declare `light` and `dark`. Check that the names read well on their own ("Gruvbox Light" / "Gruvbox Dark" in separate grids).
- Check the other `~/dev/ren/rencal-theme-*` repos: every theme declares an appearance (already required by validation).

## To verify on hardware

- Omarchy: switching to a light Omarchy theme flips the OS color scheme that WebKitGTK reports (`onThemeChanged` fires), so Omarchy in one slot plus a normal theme in the other stays consistent.
- macOS: titlebar follows the OS when unforced, and matches the theme when forced.
- Launch with System mode and differing slots in both OS appearances: no flash.

## Out of scope

- Grouping cards by package in settings. Revisit if the grids get long.
- Adaptive plugin themes (one theme with both palettes).
