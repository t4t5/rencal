---
title: Themes
description: Customize how renCal looks
---

Change renCal's theme from the settings, or press <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>T</kbd> to cycle through them.

| Theme: Gruvbox                                                                                                                         | Theme: Catpuccin Light                                                                                                                                 | Theme: Hackerman                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| <img src="/docs/theme-gruvbox.png" alt="Gruvbox theme" style="height: 18rem; width: 100%; object-fit: cover; object-position: top;" /> | <img src="/docs/theme-catpuccin-light.png" alt="Catpuccin Light theme" style="height: 18rem; width: 100%; object-fit: cover; object-position: top;" /> | <img src="/docs/theme-hackerman.png" alt="Hackerman theme" style="height: 18rem; width: 100%; object-fit: cover; object-position: top;" /> |

By default, renCal syncs with your system. To use the same theme all the time, set **Theme mode** to **Single theme**. In `~/.config/rencal/config.toml` it looks like this:

```toml
[theme]
mode = "single"   # system | single
single = "ren"
```

On Omarchy, syncing with your system uses the "Omarchy" theme instead, which updates automatically when you change your Omarchy theme:

<video src="/docs/omarchy-theme.mp4" autoplay loop muted playsinline></video>

## Add your own theme

Design a theme in the [theme builder](/theme-builder/), then save the exported CSS to `~/.config/rencal/themes/`. renCal picks up new files and edits automatically.

You can also write one by hand. Most themes only need four colors, and renCal derives the rest:

```css
/* @name My Theme */
/* @appearance dark */
--background: #0f0f0f;
--foreground: #eaeaea;
--primary: #7c3aed;
--surface-tint: #ffffff;
```

To share your theme, package it as a [theme plugin](/docs/plugins/themes/).
