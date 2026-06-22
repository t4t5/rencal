# Themes

A theme is a **bare block of CSS custom-property declarations** — no selector:

```css
--background: #0f0f0f;
--foreground: #eaeaea;
--hover-tint: #ffffff;
--primary: #7c3aed;
--highlight: #7c3aed;
```

The `[data-theme="<id>"]` scope that lets themes coexist (so the app picks one on `<body>` and the settings preview tiles can render others) is added **for you**:

- **Built-in themes** (`src/themes/*.css`) are wrapped at build time by the `rencal-themes` Vite plugin (`vite-plugin-rencal-themes.ts`) and bundled as `virtual:rencal-themes.css` (imported in `src/main.tsx`).
- **User themes** (`~/.config/rencal/themes/*.css`) are read by the Rust watcher (`src-tauri/src/external_themes.rs`) and wrapped + injected at runtime by `src/themes/ThemeRegistry.tsx`.

The defaults (the "ren" look) live in a `:root, [data-theme="ren"]` block in `src/global.css`; a theme only changes what makes it distinct. Most tokens are **derived** from a handful of primitives via `color-mix()` (the `body { ... }` block in `src/global.css`). In practice, setting `--background`, `--foreground`, `--hover-tint`, and `--primary` gets you most of a theme — hover, card, divider, secondary, etc. fall out automatically. See `tokyonight.css` for a minimal example.

## Adding a built-in theme

1. **Create the file**: `src/themes/mytheme.css` — a bare declaration block (see above). The filename is the theme id.
2. **Register it** in `src/themes/manifest.ts`:

   ```ts
   { id: "mytheme", name: "My Theme", appearance: "dark" },
   ```

That's it — no `@import`, no `index.html` edit. The Vite plugin discovers the file by glob, `useTheme` picks it up, and Ctrl/Cmd+Shift+T cycles through every registered theme. (Flash-prevention is automatic: `useTheme` caches the active theme's `--background` and `index.html` repaints it on next launch.)

## User themes

End users add themes without touching the source. Drop a `.css` file into `~/.config/rencal/themes/` and it appears under **Settings → Themes → Custom themes**:

- Same bare-declaration format as built-ins — **no selector**.
- The filename becomes the display name; override it with a leading `/* @name My Theme */` comment.
- Edits/additions/removals apply live (a Rust file-watcher re-emits the list).
- Ids are namespaced `user:<slug>` so they never collide with built-ins.

Most user themes only set variables, which is plain scoped CSS. If a theme adds **custom selectors** (the escape hatch below), they're scoped via native CSS nesting — supported in renCal's webview, but note it's the one feature a bare variable-only theme doesn't depend on.

## Primitives

These are the variables theme files override. Everything else (`--hover`, `--card`, `--secondary`, `--divider`, `--accent`, `--weekend`, `--popover`, `--input`, `--primary-hover`, `--primary-foreground`) is derived from these in `global.css` and should not be set directly unless you need to break out of the derivation.

### Colors

| Variable       | Purpose                         |
| -------------- | ------------------------------- |
| `--background` | App background                  |
| `--foreground` | Primary text                    |
| `--muted`      | De-emphasized text              |
| `--primary`    | Primary action color            |
| `--today`      | "Today" indicator color         |
| `--highlight`  | Brand accent (year badge, etc.) |
| `--ring`       | Focus rings                     |
| `--success`    | Success / accepted state        |
| `--warning`    | Warning / tentative state       |
| `--error`      | Error / declined state          |

### Hover / tint system

The derived tokens (`--hover`, `--secondary`, `--accent`, `--card`, `--divider`, `--input`, …) are all built by mixing `--hover-tint` into progressively heavier layers. Tuning these two primitives is usually enough to match a theme's palette.

| Variable       | Purpose                                                           |
| -------------- | ----------------------------------------------------------------- |
| `--hover-tint` | Color mixed over the background to produce hover / surface layers |
| `--hover-mix`  | Percentage of tint per layer (each derived token adds one more)   |

### Structure

| Variable          | Purpose                                     |
| ----------------- | ------------------------------------------- |
| `--border-button` | Button outline/shadow (often `transparent`) |

### Sizing

| Variable            | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `--radius-base`     | Base border radius                               |
| `--radius-circle`   | Pill/avatar radius (set to `0` for sharp themes) |
| `--control-height`  | Button/input height                              |
| `--tab-gap`         | Tab spacing                                      |
| `--tab-list-shadow` | Tab list outline                                 |

### Typography (fonts)

| Variable           | Purpose             |
| ------------------ | ------------------- |
| `--font-heading`   | Heading font-family |
| `--font-button`    | Button font-family  |
| `--font-numerical` | Numeric font-family |

### Typography identity (optional)

These are unset by default. Setting them from a theme opts into theme-specific typography without targeting elements directly. Unset variables fall through to Tailwind's utilities.

| Variable                         | Purpose                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `--font-heading-transform`       | `text-transform` for `.font-heading` (e.g., `uppercase`)   |
| `--font-button-transform`        | `text-transform` for `.font-button`                        |
| `--font-button-size`             | Override button font size                                  |
| `--font-numerical-size`          | Override numerical font size                               |
| `--font-heading-size`            | Base heading size (`.font-heading` with no `text-*` class) |
| `--font-heading-line-height`     | Base heading line-height                                   |
| `--font-heading-lg-size`         | Override `.font-heading.text-lg` size                      |
| `--font-heading-lg-line-height`  | Override `.font-heading.text-lg` line-height               |
| `--font-heading-xl-size`         | Override `.font-heading.text-xl` size                      |
| `--font-heading-xl-line-height`  | Override `.font-heading.text-xl` line-height               |
| `--font-heading-2xl-size`        | Override `.font-heading.text-2xl` size                     |
| `--font-heading-2xl-line-height` | Override `.font-heading.text-2xl` line-height              |

## Omarchy auto-sync

The `omarchy` theme is special: it doesn't ship a static palette. renCal reads `~/.config/omarchy/current/theme/colors.toml` at runtime and writes the colors into a managed `<style>` element as a `[data-theme="omarchy"] { ... }` rule. A Rust file-watcher (see `src-tauri/src/omarchy.rs`) re-emits on every OS theme change, so running `omarchy-theme-next` repaints renCal live without a restart.

The fetch + listen runs regardless of the active theme so the omarchy preview tile in settings always reflects the current OS theme — the `[data-theme="omarchy"]` selector keeps the rule from leaking to other themes.

If Omarchy isn't installed (or `colors.toml` is missing), no rule is written and the theme falls through to the `:root` defaults in `global.css`. The color mapping from `colors.toml` keys to CSS variables lives in `src/hooks/useOmarchyTheme.ts` — tweak it there.

## Escape hatch: custom CSS rules

If primitive overrides aren't enough, a theme file can include arbitrary CSS rules alongside its declarations. Write them as **nested selectors** — the file is already wrapped in the theme's `[data-theme="<id>"]` scope, so they won't leak to other themes:

```css
--primary: #7c3aed;

.some-component {
  /* automatically becomes [data-theme="<id>"] .some-component */
  border-radius: 0;
}
```

(Built-in themes get this flattened at build time; user themes rely on the webview's native CSS nesting.)

Prefer primitives first — the derivation chain covers most visual-identity needs. You can also override a derived token directly (e.g., set `--divider` explicitly in `classic.css`) when the computed value isn't right for the theme. Reach for custom rules only when a theme needs to reshape a specific component beyond what the contract exposes.
