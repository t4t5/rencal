---
title: Themes
description: Customize how renCal looks
---

Change renCal's theme from the settings, or press <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>T</kbd> to cycle through them.

You can preview all built-in themes (and design your own) in the [theme playground](/themes/).

| Theme: Gruvbox                                                                                                                         | Theme: Catpuccin Light                                                                                                                                 | Theme: Hackerman                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| <img src="/docs/theme-gruvbox.png" alt="Gruvbox theme" style="height: 18rem; width: 100%; object-fit: cover; object-position: top;" /> | <img src="/docs/theme-catpuccin-light.png" alt="Catpuccin Light theme" style="height: 18rem; width: 100%; object-fit: cover; object-position: top;" /> | <img src="/docs/theme-hackerman.png" alt="Hackerman theme" style="height: 18rem; width: 100%; object-fit: cover; object-position: top;" /> |

The "Omarchy" theme updates automatically when your system theme changes:

<video src="/docs/omarchy-theme.mp4" autoplay loop muted playsinline></video>

## Add your own theme

Create a `.css` file in `~/.config/rencal/themes/` to add a custom theme. renCal watches this folder, so new files, edits, and removals show up automatically in the settings.

```css
/* @name My Theme */
--background: #0f0f0f;
--foreground: #eaeaea;
--primary: #7c3aed;
--primary-foreground: #ffffff;
--surface-tint: #ffffff;
```

Most themes only need to set `--background`, `--foreground`, `--primary`, and `--surface-tint`. renCal derives surfaces, borders, hover states, and other colors from those values. Set `--primary-foreground` when the default text colour on `--primary` lacks contrast.
