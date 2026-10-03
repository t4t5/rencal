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

renCal derives most surface and border colours from these values. The [theme builder](https://rencal.org/theme-builder/) can generate CSS. Add a second `[[contributes.themes]]` entry with `appearance = "light"` when the user wants a matching light theme. Each theme ID must be unique within the plugin and use lowercase letters, digits, or hyphens. CSS paths must be relative `.css` files in the checkout.

Fonts are optional and shared by all themes in the package. Declare each WOFF2 face with `[[contributes.fonts]]`, `family`, and `file`; optional `weight` defaults to 400 and `style` to `normal`. Use a fallback font in the CSS.

To list a published plugin in the directory, add the `rencal-plugin` GitHub topic. A theme plugin can ship from the default branch without a release. If it has a stable release, renCal uses the latest release instead. A root-level `preview.png` is optional for the directory.
