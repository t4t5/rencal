# Themes

Themes live in `src/themes/` and override a small set of primitive CSS variables. The defaults (the "ren" look) live in the `@theme` block in `src/global.css`; a theme's job is to change only what makes it distinct.

Most tokens are **derived** from a handful of primitives via `color-mix()` (declared in the `body { ... }` block in `src/global.css`). In practice, setting `--background`, `--foreground`, `--hover-tint`, and `--primary` gets you most of a theme — hover, card, divider, secondary, etc. all fall out automatically. See `tokyonight.css` for a minimal example.

## Adding a theme

1. **Create the CSS file**: `src/themes/mytheme.css`.

   ```css
   body[data-theme="mytheme"] {
     --background: #0f0f0f;
     --foreground: #eaeaea;
     --hover-tint: #ffffff;
     --primary: #7c3aed;
     --highlight: #7c3aed;
   }
   ```

2. **Import it** from `src/global.css` (add next to the other theme imports).

3. **Register it** in `src/themes/manifest.ts`:

   ```ts
   { id: "mytheme", name: "My Theme", background: "#0f0f0f" },
   ```

4. **Add a flash-prevention rule** in `index.html` pointing at the theme's background color. This runs before the CSS bundle loads, so it has to live inline:

   ```html
   body[data-theme="mytheme"], body:not([data-theme])[data-default-theme="mytheme"] {
   background-color: #0f0f0f; }
   ```

That's it. `useTheme` will pick up the new theme automatically, and Ctrl/Cmd+Shift+T cycles through all registered themes.

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

## Escape hatch: custom CSS rules

If primitive overrides aren't enough, theme files can include arbitrary CSS rules. Scope them with `body[data-theme="yourtheme"]` (or use CSS nesting inside the body selector) so they don't leak to other themes.

Prefer primitives first — the derivation chain covers most visual-identity needs. You can also override a derived token directly (e.g., set `--divider` explicitly in `classic.css`) when the computed value isn't right for the theme. Reach for custom rules only when a theme needs to reshape a specific component beyond what the contract exposes.
