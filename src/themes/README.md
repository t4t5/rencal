# Themes

Themes live in `src/themes/` and override a small set of semantic CSS variables. The defaults (the "classic" look) live in the `[data-theme]` block inside `src/global.css`; a theme's job is to change only what makes it distinct.

## Adding a theme

1. **Create the CSS file**: `src/themes/mytheme.css`.

   ```css
   body[data-theme="mytheme"] {
     --background-primary: #0f0f0f;
     --interactive-accent: #7c3aed;
     --interactive-accent-hover: #8b5cf6;
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

## Semantic variable contract

These are the variables theme files override. Anything not listed here is either derived from these (via shadcn aliases) or internal.

### Backgrounds

| Variable                 | Purpose                        |
| ------------------------ | ------------------------------ |
| `--background-primary`   | App background                 |
| `--background-secondary` | Cards, sidebars, raised panels |
| `--background-popover`   | Popovers, menus, tooltips      |
| `--background-overlay`   | Modal backdrop                 |
| `--background-weekend`   | Calendar weekend cells         |

### Text

| Variable           | Purpose                                |
| ------------------ | -------------------------------------- |
| `--text-normal`    | Primary body text                      |
| `--text-muted`     | Secondary / de-emphasized              |
| `--text-faint`     | Tertiary / subtle                      |
| `--text-on-accent` | Text layered on `--interactive-accent` |

### Interactive

| Variable                     | Purpose                               |
| ---------------------------- | ------------------------------------- |
| `--interactive-normal`       | Default / secondary button background |
| `--interactive-hover`        | Hover state for normal buttons        |
| `--interactive-accent`       | Primary action color                  |
| `--interactive-accent-hover` | Primary action hover                  |

### Structure

| Variable          | Purpose                                     |
| ----------------- | ------------------------------------------- |
| `--border-color`  | Generic element borders                     |
| `--divider`       | Section dividers                            |
| `--input-border`  | Input field borders                         |
| `--button-border` | Button outline/shadow (often `transparent`) |
| `--ring-color`    | Focus rings                                 |

### Status / brand

| Variable      | Purpose                                |
| ------------- | -------------------------------------- |
| `--success`   | Success state                          |
| `--warning`   | Warning state                          |
| `--error`     | Error / destructive                    |
| `--highlight` | Brand accent (e.g., "today" indicator) |
| `--active`    | Distinct active-indicator color        |
| `--active-bg` | Active state background                |

### Sizing

| Variable            | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `--radius`          | Base border radius                               |
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

If variable overrides aren't enough, theme files can include arbitrary CSS rules beyond variable overrides. Scope them with `body[data-theme="yourtheme"]` (or use CSS nesting inside the body selector) so they don't leak to other themes.

Prefer variables first — the existing contract covers most visual-identity needs, including typography transform and size overrides. Reach for custom rules only when a theme needs to reshape a specific component beyond what the contract exposes.
