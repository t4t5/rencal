---
title: Themes
description: Choose a built-in theme, follow Omarchy, or add a custom renCal theme.
---

Choose a theme under **Settings → Themes**. Press <kbd>Cmd/Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd> to cycle through the available themes.

renCal includes:

- **Omarchy (Auto)**
- **Ren**
- **Catpuccin Latte**
- **Tokyo Night**
- **Classic**

![Theme selector in renCal settings](/docs/settings-themes.png)

## Omarchy theme

The **Omarchy (Auto)** theme follows the active Omarchy system palette. When the system theme changes, renCal updates without needing to restart.

<video src="/docs/omarchy-theme.mp4" autoplay loop muted playsinline></video>

If Omarchy is not installed or its colour file is unavailable, renCal falls back to its default colours.

## Add a custom theme

Create a `.css` file in `~/.config/rencal/themes/`. The filename becomes the theme name; use an `@name` comment to override it.

```css
/* @name My Theme */
--background: #0f0f0f;
--foreground: #eaeaea;
--muted: rgba(234, 234, 234, 0.6);
--primary: #7c3aed;
--highlight: #7c3aed;
--hover-tint: #ffffff;
```

Most themes only need `--background`, `--foreground`, `--muted`, `--primary`, `--highlight`, and `--hover-tint`. renCal derives surfaces, dividers, hover states, and related colours from them.

The file contains bare declarations—do not wrap them in a selector. New themes and saved edits appear in Settings automatically, and removing the file removes the theme.
