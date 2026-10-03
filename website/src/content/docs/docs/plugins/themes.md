---
title: Theme plugins
description: Package and share renCal themes as a plugin.
---

Export your theme's CSS from the [theme builder](/theme-builder/) and put it next to a `rencal-plugin.toml`:

```toml
id = "alice.dusk"
name = "Dusk"
description = "A quiet theme for renCal"
min_rencal_version = "0.8.0"

[[contributes.themes]]
id = "dark"
name = "Dusk Dark"
css = "dark.css"
appearance = "dark"

[[contributes.themes]]
id = "light"
name = "Dusk Light"
css = "light.css"
appearance = "light"
```

## Fonts

Plugins can bundle WOFF2 fonts for their themes to use:

```toml
[[contributes.fonts]]
family = "Dusk Sans"
file = "fonts/dusk-sans-bold.woff2"
weight = 700  # optional, defaults to 400
```

Then reference the font in your CSS: `--font-body: "Dusk Sans", sans-serif;`.
