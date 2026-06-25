---
title: Themes
description: Customize how renCal looks
---

Change renCal's theme from the settings, or press <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>T</kbd> to cycle through them.

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
--muted: rgba(234, 234, 234, 0.6);
--primary: #7c3aed;
--highlight: #7c3aed;
--hover-tint: #ffffff;
```

Most themes only need to set `--background`, `--foreground`, `--muted`, `--primary`, `--highlight`, and `--hover-tint`. renCal derives surfaces, dividers, hover states, and other colors from those values.
