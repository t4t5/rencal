# Theme plugins

Create `rencal-plugin.toml` and a CSS file at the repository root:

```toml
id = "alice.dusk"
name = "Dusk"
description = "A quiet dark theme for renCal"
min_rencal_version = "0.8.0"

[[contributes.themes]]
id = "dark"
name = "Dusk Dark"
css = "theme.css"
appearance = "dark"
```

`theme.css` contains CSS custom property declarations, without a selector:

```css
--background: #0f0f0f;
--foreground: #eaeaea;
--primary: #7c3aed;
--primary-foreground: #ffffff;
--surface-tint: #ffffff;
```

Text is drawn in roles, each with a size and line height a theme can set: `--text-body`, `--text-body-lg`, `--text-caption`, `--text-micro`, `--text-section`, `--text-title`, `--text-display`, `--text-button`, `--text-button-sm`, `--text-numerical`, `--text-numerical-sm` and `--text-numerical-lg`, each with a `--line-height` twin (`--text-body--line-height`). Unset, a role follows the Tailwind scale (`--text-body` is `--text-sm`, `--text-caption` is `--text-xs`), and titles follow `--text-heading`. Headings, buttons and numbers take their font, case and weight from `--font-heading`, `--text-heading--transform` and `--text-heading--font-weight` (likewise `button` and `numerical`).

Buttons and fields can take bevels as tokens: `--button-shadow` and `--button-shadow-active` (pressed) are `box-shadow` values for every button, and `--control` and `--control-shadow` are the background and `box-shadow` of text fields and selects. Not every renCal build applies nested selectors, so prefer these tokens to rules for those looks.

renCal derives most surface and border colours from these values. The [theme builder](https://rencal.org/theme-builder/) can generate CSS. Add a second `[[contributes.themes]]` entry with `appearance = "light"` when the user wants a matching light theme. Each theme ID must be unique within the plugin and use lowercase letters, digits, or hyphens. CSS paths must be relative `.css` files in the checkout.

Fonts are optional and shared by all themes in the package. Declare each WOFF2 face with `[[contributes.fonts]]`, `family`, and `file`; optional `weight` defaults to 400 and `style` to `normal`. Use a fallback font in the CSS.

A theme plugin can ship from the default branch without a release. If it has a stable release, renCal uses the latest release instead.
