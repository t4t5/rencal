# Themes

Themes live in `src/themes/` and override a small set of semantic CSS variables. The defaults (the "classic" look) live in `:root` inside `src/global.css`; a theme's job is to change only what makes it distinct.

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

| Variable            | Purpose                                |
| ------------------- | -------------------------------------- |
| `--color-success`   | Success state                          |
| `--color-warning`   | Warning state                          |
| `--color-error`     | Error / destructive                    |
| `--color-highlight` | Brand accent (e.g., "today" indicator) |
| `--color-active`    | Distinct active-indicator color        |
| `--color-active-bg` | Active state background                |

### Sizing

| Variable            | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `--radius`          | Base border radius                               |
| `--radius-circle`   | Pill/avatar radius (set to `0` for sharp themes) |
| `--control-height`  | Button/input height                              |
| `--tab-gap`         | Tab spacing                                      |
| `--tab-list-shadow` | Tab list outline                                 |

### Typography

| Variable           | Purpose             |
| ------------------ | ------------------- |
| `--font-heading`   | Heading font-family |
| `--font-button`    | Button font-family  |
| `--font-numerical` | Numeric font-family |

## Escape hatch: custom CSS rules

A theme file can include arbitrary CSS rules beyond variable overrides — useful for a signature visual identity. Scope them with `body[data-theme="yourtheme"]` so they don't leak. `ren.css` is the reference example: uppercase headings, downshifted font sizes, monospace everywhere.
