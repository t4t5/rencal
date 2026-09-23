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

Placeholder text uses `--placeholder-foreground`, which defaults to `--muted-foreground`. Set it only when a theme needs placeholders to differ from other de-emphasized text.

Generated shadcn declarations keep their usual meanings, including `--card`, `--popover`, `--secondary`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, `--radius`, `--font-sans`, and `--font-mono`. Paste them into the same bare declaration block `--hover-tint` defaults to `--foreground`, so hover and weekend tints stay visible on light and dark palettes alike.

renCal adds `--selected` and `--selected-foreground` for persistent selection;
they derive one tint step beyond `--accent` unless the theme sets them directly.
Filled "today" markers use `--today-foreground`, tooltips use `--tooltip-foreground`,
and `--highlight` fills use `--highlight-foreground`.

Surfaces that set their own text colour also swap `--muted-foreground` for a
matching muted colour: `--secondary-muted-foreground`, `--accent-muted-foreground`,
`--selected-muted-foreground`, `--card-muted-foreground`,
`--popover-muted-foreground`, and `--tooltip-muted-foreground`. They default to
`--muted-foreground`; set them when a surface's foreground differs from the page's.

You can change the Tailwind type scale directly with `--text-xs`, `--text-sm`, `--text-base`, and the matching `--text-<step>--line-height` properties. Line heights must use pixels because month lanes derive their height from `--text-xs--line-height`.

```css
/* Compact example; 24px is the supported minimum control height. */
--control-height: 24px;
--control-height-sm: 24px;
--control-height-lg: 28px;
--control-padding-inline: 6px;
--control-content-gap: 6px;
--agenda-padding-inline: 6px;
--text-base: 14px;
--text-base--line-height: 20px;
--text-xs: 11px;
--text-xs--line-height: 14px;
```

For component-specific custom CSS, target stable slot attributes. Select on `data-slot` for identity and on the other attributes documented on this page, summarized in the table below; any other `data-*` attributes, such as `data-drop-zone`, `data-drag-scroll`, `data-date-key`, and `data-event-clickable`, are internal interaction hooks and may change without notice. Prefer a child slot over a descendant element selector.

| Attribute                                                                                                       | Meaning                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-slot`                                                                                                     | Component or component-part identity. Always a single value; names follow shadcn where one exists.                                                |
| `data-variant`, `data-size`                                                                                     | Public presentation choices, such as a button or input variant.                                                                                   |
| Native, ARIA, and primitive state (`:disabled`, `aria-invalid`, `data-state`, `data-disabled`, `data-readonly`) | Interaction state. Composite surfaces such as `combobox` and `textarea-wrapper` mirror their inner control's `data-disabled` and `data-readonly`. |
| `data-button`, `data-control`, `data-control-part`                                                              | Additional identities preserved through composition.                                                                                              |
| `data-view`, `data-kind`, and event state attributes                                                            | Calendar-specific context.                                                                                                                        |

```css
[data-slot="button"] {
  border-width: 2px;
}
```

The control spacing variables adjust the event composer and editor as a unit. `--control-padding-inline` controls the inside edges, `--control-icon-size` sizes the icon, checkbox, or icon-button slot, and `--control-content-gap` separates the leading, content, and trailing parts. By default, the icon size is derived as `calc(var(--control-height) - 10px)`, so compact themes only need to change the control height.

`--agenda-padding-inline` keeps agenda date headers, empty states, all-day groups, and timed rows on the same horizontal inset.

Event forms expose `event-form`, `event-form-fields`, and `event-form-footer` slots. Field rows expose `control-leading`, `control-content`, and `control-trailing`; existing primitives keep their original slots and identify the same roles with `data-control-part="leading"`, `"content"`, or `"trailing"`. Row roots use `data-control-layout="row"`. Complete composite surfaces use `combobox` and `textarea-wrapper`. Apply borders, backgrounds, radii, hover states, and focus styles to those complete surface slots. For example, a theme can retain an inset submit action with:

```css
[data-slot="event-form-footer"] {
  padding-inline: 8px;
}
```

Removable list rows, such as reminders and conference links, add `data-variant="item"` to the row root and use `accent` / `accent-foreground` while hovered or focused within. The `select-icon` slot owns the dropdown arrow's colour and visibility; its glyph draws with `currentColor`.

Elements expose their typography role through `data-typography`: headings use `heading`, numeric labels use `numerical`, ordinary button actions use `action`, and actions embedded in event fields use `field`. The field role uses the body font, small text scale, and normal casing independently of the button's surface variant.

### Calendar events

Every event block exposes `data-slot="calendar-event"`, including week, month,
agenda, board, search, and drag renderings. Use `data-view` to specialize a view
and `data-kind` (`timed` or `all-day`) to specialize its shape. Event content
uses the stable `calendar-event-title`, `calendar-event-time`, and
`calendar-event-color-marker` slots.

The event root carries `data-selected`, `data-rsvp`, `data-draft`,
`data-dimmed`, and `data-drag-state` when those states apply. RSVP values are
`accepted`, `tentative`, `declined`, and `needs-action`; false boolean states are
omitted. Do not style `data-event-clickable`, which is an internal interaction
marker.

renCal sets the event's source colour as `--calendar-event-color`. All visible
paint is regular CSS, so a theme can override backgrounds, text, borders, and
shadows without `!important`. Preserve inline positioning and sizing: those
values are event geometry.

Event hover uses `--hover`. On unfilled blocks, `data-selected` uses
`--selected` / `--selected-foreground`; filled blocks use the derived
`--calendar-event-selected-fill`.

Every select-like trigger exposes `data-control="select"`: the Select trigger,
comboboxes, toolbar dropdowns, and the searchable timezone button. Composed
controls retain their primitive slot, so the timezone button remains a
`popover-trigger` with a `select-icon` child; shared dropdown-field rules should
target the control marker, and `select-trigger` identifies only the real Select.

The old text token `--muted` is now `--muted-foreground`; `--muted` has shadcn's surface meaning. The old `--divider` token is no longer supported; use `--border`. `--radius-base` has a temporary compatibility fallback, but new themes should use `--radius`.
