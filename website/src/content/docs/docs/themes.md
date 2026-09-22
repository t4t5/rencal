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
--muted-foreground: rgba(234, 234, 234, 0.6);
--primary: #7c3aed;
--highlight: #7c3aed;
--hover-tint: #ffffff;
```

Most themes only need to set `--background`, `--foreground`, `--muted-foreground`, `--primary`, `--highlight`, and `--hover-tint`. renCal derives shadcn-compatible surfaces, borders, hover states, and foreground colors from those values.

Generated shadcn declarations keep their usual meanings, including `--card`, `--popover`, `--secondary`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, `--radius`, `--font-sans`, and `--font-mono`. Paste them into the same bare declaration block and add `--hover-tint` if it is missing.

You can change the Tailwind type scale directly with `--text-xs`, `--text-sm`, `--text-base`, and the matching `--text-<step>--line-height` properties. Line heights must use pixels because month lanes derive their height from `--text-xs--line-height`.

```css
/* Compact example; 24px is the supported minimum control height. */
--control-height: 24px;
--control-height-sm: 24px;
--control-height-lg: 28px;
--control-padding-inline: 6px;
--control-content-gap: 6px;
--text-base: 14px;
--text-base--line-height: 20px;
--text-xs: 11px;
--text-xs--line-height: 14px;
```

For component-specific custom CSS, target stable slot attributes:

```css
[data-slot="button"] {
  border-width: 2px;
}
```

The control spacing variables adjust the event composer and editor as a unit. `--control-padding-inline` controls the inside edges, `--control-icon-size` sizes the icon, checkbox, or icon-button slot, and `--control-content-gap` separates the leading, content, and trailing parts. By default, the icon size is derived as `calc(var(--control-height) - 4px)`, so compact themes only need to change the control height.

Event forms expose `event-form`, `event-form-fields`, and `event-form-footer` slots. Field rows expose `control-leading`, `control-content`, and `control-trailing`; existing primitives keep their original slots and identify the same roles with `data-control-part="leading"`, `"content"`, or `"trailing"`. Row roots use `data-control-layout="row"`. Complete composite surfaces use `combobox` and `textarea-wrapper`. Apply borders, backgrounds, radii, hover states, and focus styles to those complete surface slots. For example, a theme can retain an inset submit action with:

```css
[data-slot="event-form-footer"] {
  padding-inline: 8px;
}
```

Buttons expose `data-typography="action"` for ordinary actions and `data-typography="field"` for actions embedded in event fields. The field role uses the body font, small text scale, and normal casing independently of the button's surface variant.

The old text token `--muted` is now `--muted-foreground`; `--muted` has shadcn's surface meaning. `--divider` and `--radius-base` have temporary compatibility fallbacks, but new themes should use `--border` and `--radius`.
