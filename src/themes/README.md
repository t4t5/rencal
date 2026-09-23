# Themes

A theme is a **bare block of CSS custom-property declarations** — no selector:

```css
--background: #0f0f0f;
--foreground: #eaeaea;
--hover-tint: #ffffff;
--primary: #7c3aed;
--highlight: #7c3aed;
```

The `[data-theme="<id>"]` selector is added **for you**:

- **Built-in themes** (`src/themes/*.css`) are wrapped at build time by the `rencal-themes` Vite plugin (`vite-plugin-rencal-themes.ts`) and bundled as `virtual:rencal-themes.css` (imported in `src/main.tsx`).
- **External themes** (user files in `~/.config/rencal/themes/*.css` and plugin themes) are read by the Rust watcher (`src-tauri/src/external_themes.rs`) and held in `src/themes/ThemeRegistry.tsx`. `useTheme` injects only the selected external theme's CSS, replacing it when selection changes. Selecting a built-in or unknown theme, or removing the active external theme, removes the external stylesheet.

External preview tiles use only custom properties parsed from the theme's top-level declaration block, applied as inline styles on the tile. They do not load custom selectors or stylesheets. Installing or updating an inactive theme therefore does not enable its full CSS.

The defaults (the "ren" look) live in a `:root, [data-theme]` baseline block in `src/global.css`; a theme only changes what makes it distinct. Most tokens are **derived** from a handful of primitives via `color-mix()` in that same block. In practice, setting `--background`, `--foreground`, `--hover-tint`, and `--primary` gets you most of a theme—hover, card, border, secondary, and the other surfaces follow automatically. See `tokyonight.css` for a minimal example.

## Theme scopes

Every element with `data-theme` resolves from the complete ren baseline, not from its enclosing theme. The baseline declares every documented token on each scope: primitives, the type scale, derived surfaces, and optional overrides (reset to unset so their fallbacks apply). A theme nested inside another, such as a settings preview tile, therefore looks the same as it does on `<body>`. Give a nested scope its own `data-appearance` too, or it gets the dark event-text defaults.

The promise covers custom properties only. It has these limits:

- **Portals.** Popovers, menus, dialogs, and tooltips portal to `document.body`, so their content takes the body's theme, not the scope that opened them. The app theme is applied on `<body>`, so global theming is unaffected. An independently themed subtree (for example, a future plugin view) would need its portals to target a container inside that scope.
- **Custom selectors.** An enclosing theme's escape-hatch rules (`[data-theme="a"] [data-slot="button"]`) match descendants inside a nested scope too.
- **`dark:` variants** match any descendant of a `[data-appearance="dark"]` element, including one inside a nested light scope.
- **Undocumented properties.** Tokens outside this README (other Tailwind `@theme` values, a theme's private helpers) are not reset.

## Adding a built-in theme

1. **Create the file**: `src/themes/mytheme.css` — a bare declaration block (see above). The filename is the theme id.
2. **Register it** in `src/themes/manifest.ts`:

   ```ts
   { id: "mytheme", name: "My Theme", appearance: "dark" },
   ```

That's it — no `@import`, no `index.html` edit. The Vite plugin discovers the file by glob, `useTheme` picks it up, and Ctrl/Cmd+Shift+T cycles through every registered theme. The website's theme playground (`website/src/pages/themes.astro`) also imports the manifest and the CSS files at build time, so the new theme appears there without any website change. (Flash-prevention is automatic: `useTheme` caches the active theme's `--background` and `index.html` repaints it on next launch.)

## User themes

End users add themes without touching the source. Drop a `.css` file into `~/.config/rencal/themes/` and it appears under **Settings → Themes → Custom themes**:

- Same bare-declaration format as built-ins — **no selector**.
- The filename becomes the display name; override it with a leading `/* @name My Theme */` comment.
- Edits/additions/removals apply live (a Rust file-watcher re-emits the list).
- Ids are namespaced `user:<slug>` so they never collide with built-ins.

Most user themes only set variables, which is plain scoped CSS. If a theme adds **custom selectors** (the escape hatch below), they're scoped via native CSS nesting — supported in renCal's webview, but note it's the one feature a bare variable-only theme doesn't depend on.

## Primitives

These are the variables theme files normally override. Surfaces and state colors (`--hover`, `--card`, `--secondary`, `--border`, `--accent`, `--selected`, `--muted`, `--popover`, `--input`, and their foregrounds) are derived on the `[data-theme]` node. The shadcn tokens keep their standard meanings; renCal's additional selection pair remains directly overridable too.

### Colors

| Variable                   | Purpose                                            |
| -------------------------- | -------------------------------------------------- |
| `--background`             | App background                                     |
| `--foreground`             | Primary text                                       |
| `--muted-foreground`       | De-emphasized text                                 |
| `--placeholder-foreground` | Placeholder text; defaults to `--muted-foreground` |
| `--primary`                | Primary action color                               |
| `--today`                  | "Today" indicator color                            |
| `--highlight`              | Brand accent (year badge, etc.)                    |
| `--ring`                   | Focus rings                                        |
| `--success`                | Success / accepted state                           |
| `--warning`                | Warning / tentative state                          |
| `--error`                  | Error / declined state                             |

#### Optional colors

The selection pair is derived by default and can be overridden as a unit. Event
colour overrides are unset by default and opt in to their documented behaviour.

| Variable                | Purpose                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--selected`            | Persistent selection surface; defaults to one tint step beyond `--accent`.                                                                                 |
| `--selected-foreground` | Text colour on the persistent selection surface; defaults to `--foreground`.                                                                               |
| `--event-color`         | Paints every event (and calendar swatch) in this one colour, ignoring per-calendar and per-event colours. For monochrome themes — see `electric-blue.css`. |
| `--event-background`    | Solid fill for filled event blocks (all-day chips, week-view timed events), replacing the derived tint.                                                    |
| `--event-foreground`    | Text colour on that fill (e.g. `white`). Bar-and-text events (agenda, board, month time labels) keep the derived colour.                                   |

#### Event text

Event text is derived from each event's accent colour. With these unset (the dark-theme default) it is the accent, chroma-boosted, mixed into `--foreground` for a soft pastel. That mix muddies accents on a light background (yellow + black is olive), so `global.css` overrides the first and last for `[data-appearance="light"]` — `useTheme` puts the theme's appearance on `<body>` — and a theme can set any of them directly.

| Variable                      | Purpose                                                                                                       | Dark     | Light  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| `--event-text-max-lightness`  | Cap on the accent's OKLCH lightness before it becomes text                                                    | `1`      | `0.45` |
| `--event-text-chroma`         | Chroma multiplier applied to the accent                                                                       | `1.4`    | `1.4`  |
| `--event-text-foreground-mix` | Share of `--foreground` mixed into the text. Unset it varies per block state (40–60%, dashed and draft lower) | `40–60%` | `0%`   |

### Hover / tint system

The derived tokens (`--hover`, `--secondary`, `--accent`, `--muted`, `--card`, `--border`, `--input`, …) are built by mixing `--hover-tint` into progressively heavier layers. Tuning these two primitives is usually enough to match a theme's palette.

| Variable       | Purpose                                                           |
| -------------- | ----------------------------------------------------------------- |
| `--hover-tint` | Color mixed over the background to produce hover / surface layers |
| `--hover-mix`  | Percentage of tint per layer (each derived token adds one more)   |

Tooltips use a solid `--tooltip` surface derived from 15% `--hover-tint` mixed into `--background`, with a matching arrow.

Interactive state has three tiers. `accent` / `accent-foreground` is the
transient highlight for menu items, keyboard focus, ghost buttons, and neutral
control rows. `hover` is a transparent content tint with no paired foreground,
so event and agenda text keeps its own colour. `selected` /
`selected-foreground` is the persistent state for highlighted events, active
month days, and selected mini-calendar days. Selection never uses `accent`, and
a selected item does not react to hover. Keyboard focus remains transient and
uses a ring or `accent`, never `selected`.

`secondary` is a secondary button surface, and `muted` is a static
de-emphasized surface. If a theme needs lighter menu highlights, change its
`accent` value rather than pairing an unrelated surface with
`accent-foreground`.

For development, `contract-debug.css` supplies deliberately clashing values for
these surfaces. It is intentionally absent from the manifest, so it does not
appear in the theme picker or public playground. Apply it temporarily from the
browser console with `document.body.dataset.theme = "contract-debug"`.

### Structure

| Variable                      | Purpose                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `--border-button`             | Button outline/shadow (often `transparent`)                                    |
| `--control-active-background` | Complete input/select surface while focused or open; defaults to `--secondary` |
| `--control-active-border`     | Input/select border while focused or open; defaults to `transparent`           |

Control primitives decide whether focus, focus-within, or an open popup makes
their complete surface active. Themes only supply the paint. Keeping
`--control-active-border` transparent lets the background extend beneath the
reserved border without adding a second translucent layer; themes that want an
active outline can set it to `var(--border)` or another color.

### Sizing

| Variable                   | Purpose                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `--radius`                 | Base border radius (shadcn-compatible)                                              |
| `--radius-circle`          | Pill/avatar radius (set to `0` for sharp themes)                                    |
| `--control-height`         | Button/input height                                                                 |
| `--control-height-sm`      | Small button height                                                                 |
| `--control-height-lg`      | Large button height                                                                 |
| `--control-padding-inline` | Horizontal padding inside event field rows (`8px` by default)                       |
| `--control-icon-size`      | Event-field icon slot size; defaults to `calc(var(--control-height) - 10px)`        |
| `--control-content-gap`    | Gap between leading, content, and trailing parts of event fields (`8px` by default) |
| `--control-row-gap`        | Vertical gap between event field rows (`4px` by default)                            |
| `--agenda-padding-inline`  | Shared horizontal inset for agenda headers and rows (`12px` by default)             |
| `--tab-gap`                | Tab spacing                                                                         |
| `--tab-list-shadow`        | Tab list outline                                                                    |

### Typography (fonts)

| Variable           | Purpose                          |
| ------------------ | -------------------------------- |
| `--font-sans`      | Tailwind/shadcn sans family      |
| `--font-mono`      | Tailwind/shadcn monospace family |
| `--font-body`      | Application body font-family     |
| `--font-heading`   | Heading role font-family         |
| `--font-button`    | Button role font-family          |
| `--font-numerical` | Numeric role font-family         |

Plugin themes can bundle WOFF2 faces declared by their package manifest. The family is then used like any other CSS font value, with a fallback stack for graceful degradation:

```toml
[[contributes.fonts]]
family = "Pixelated MS Sans Serif"
file = "fonts/ms_sans_serif.woff2"
```

```css
--font-body: "Pixelated MS Sans Serif", Arial, sans-serif;
--font-heading: "Pixelated MS Sans Serif", Arial, sans-serif;
```

### Typography identity (optional)

These are unset by default. Setting them opts into role-specific typography without targeting elements directly. A `text-*` utility on the same element intentionally uses the global scale instead.

| Variable                       | Purpose                         |
| ------------------------------ | ------------------------------- |
| `--font-heading-transform`     | Heading role `text-transform`   |
| `--font-button-transform`      | Button role `text-transform`    |
| `--font-numerical-transform`   | Numerical role `text-transform` |
| `--font-heading-size`          | Heading role size               |
| `--font-heading-line-height`   | Heading role line height        |
| `--font-button-size`           | Button role size                |
| `--font-button-line-height`    | Button role line height         |
| `--font-numerical-size`        | Numerical role size             |
| `--font-numerical-line-height` | Numerical role line height      |

Elements expose their role through `data-typography`: headings use `heading`, numeric labels use `numerical`, ordinary button actions use `action`, and inline event-field actions use `field`. Field actions deliberately use the body family, the small text scale, and normal casing; surface variants such as `ghost` do not change that role.

### Type scale

Tailwind utilities consume these variables directly: `--text-2xs`, `--text-xs`, `--text-sm`, `--text-base`, `--text-lg`, `--text-xl`, `--text-2xl`, and the matching `--text-<step>--line-height` token. Use pixel line heights because month-view lane height is `calc(var(--text-xs--line-height) + 4px)`.

This compact theme changes density and typography only through top-level tokens. `24px` is the supported minimum control height:

```css
--control-height: 24px;
--control-height-sm: 24px;
--control-height-lg: 28px;
--text-base: 14px;
--text-base--line-height: 20px;
--text-sm: 12px;
--text-sm--line-height: 16px;
--text-xs: 11px;
--text-xs--line-height: 14px;
```

The four control-spacing properties apply to the event composer and editor. Override them together or independently to change field density without repairing individual rows. A larger text scale should also use control heights that leave enough room for the resulting line height.

There are no arbitrary font sizes in the app. Remaining arbitrary dimensions are layout constraints rather than theme tokens: the minical's default `38px` day target, portal viewport limits and trigger dimensions, dialog widths, and fixed calendar/grid geometry such as hour height and gutter width.

### Pasting a shadcn theme

shadcn names keep their standard meaning, so generated declarations such as `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--primary`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`, `--font-sans`, and `--font-mono` can be pasted directly. Add `--hover-tint` if the generated theme does not provide it; renCal then derives any omitted surface tokens.

## Omarchy auto-sync

The `omarchy` theme is special: it doesn't ship a static palette. renCal reads `~/.local/state/omarchy/current/theme/colors.toml` on Omarchy quattro or `~/.config/omarchy/current/theme/colors.toml` on v3, then writes the colors into a managed `<style>` element as a `[data-theme="omarchy"] { ... }` rule. The Rust integration in `src-tauri/src/omarchy.rs` normalizes v3 ANSI, v4 semantic, and hybrid palettes into one shape. Its file-watcher re-emits on every OS theme change, so changing the Omarchy theme repaints renCal live without a restart.

The fetch + listen runs regardless of the active theme so the omarchy preview tile in settings always reflects the current OS theme — the `[data-theme="omarchy"]` selector keeps the rule from leaking to other themes.

**Monochrome Omarchy themes.** Some Omarchy themes are built around a single hue or none at all (Vantablack, White, Solitude, Lumon). For these, per-calendar event colours would be the only thing clashing with the desktop, so `useOmarchyTheme` gives them the Electric Blue treatment: the accent for `--primary` / `--today` / `--highlight` / `--hover-tint`, and `--event-color` / `--event-background` / `--event-foreground` set so every event is a solid accent fill. The list is a static `MONOCHROME_THEMES` set in `src/hooks/useOmarchyTheme.ts`, keyed by the theme slug the Rust side resolves from `current/theme.name` (quattro) or the `current/theme` symlink (v3). "Monochrome" is a design call rather than something the palette reliably encodes (Hackerman's blue is periwinkle next to its greens, matte-black is orange plus red), so add to the list by hand.

If Omarchy isn't installed (or `colors.toml` is missing), no rule is written and the theme falls through to the `:root` defaults in `global.css`. Palette fallback resolution lives in `src-tauri/src/omarchy.rs`; the normalized semantic-color to CSS-variable mapping lives in `src/hooks/useOmarchyTheme.ts`.

## Escape hatch: custom CSS rules

If primitive overrides aren't enough, a theme file can include arbitrary CSS rules alongside its declarations. Write them as **nested selectors** inside the theme's `[data-theme="<id>"]` wrapper:

```css
--primary: #7c3aed;

[data-slot="button"] {
  /* automatically becomes [data-theme="<id>"] [data-slot="button"] */
  border-radius: 0;
}
```

(Built-in themes get this flattened at build time; user themes rely on the webview's native CSS nesting.)

The wrapper is a convenience, not a security boundary: malformed CSS can close it and introduce global rules. Selecting an external theme enables its unrestricted CSS for that window. Switching back to a built-in theme removes that CSS and restores the built-in styling. Inactive previews show custom-property palettes only; custom selectors take effect when selected.

Prefer primitives first—the derivation chain covers most visual-identity needs. You can also override a derived token directly (for example, set `--border`) when the computed value is not right for the theme. Target stable `data-slot` attributes in custom rules; class names are implementation details.

Custom rules may select on `data-slot` for identity and on the other attributes documented here, summarized in the table below. Any other `data-*` attribute (`data-drop-zone`, `data-drag-scroll`, `data-date-key`, `data-create-selection`, `data-agenda-item`, `data-event-clickable`, and similar) is an interaction hook for the app's own scripts and is not part of the styling contract; it can change without notice. Use the same rule for element and descendant selectors: prefer a child slot such as `minical-year` over `[data-slot="minical-title"] span`.

| Attribute                                                                                                       | Meaning                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-slot`                                                                                                     | Component or component-part identity. Always a single value; names follow shadcn where one exists.                                                |
| `data-variant`, `data-size`                                                                                     | Public presentation choices, such as a button or input variant.                                                                                   |
| Native, ARIA, and primitive state (`:disabled`, `aria-invalid`, `data-state`, `data-disabled`, `data-readonly`) | Interaction state. Composite surfaces such as `combobox` and `textarea-wrapper` mirror their inner control's `data-disabled` and `data-readonly`. |
| `data-button`, `data-control`, `data-control-part`                                                              | Additional identities preserved through composition.                                                                                              |
| `data-view`, `data-kind`, and event state attributes                                                            | Calendar-specific context.                                                                                                                        |

The event form exposes `event-form`, `event-form-fields`, and `event-form-footer`. Its shared row parts expose `control-leading`, `control-content`, and `control-trailing`. Existing primitives such as input-group add-ons keep their original slot and expose the same role through `data-control-part="leading"`, `"content"`, or `"trailing"`; row roots similarly expose `data-control-layout="row"`. Composite controls expose their complete painted surfaces as `combobox` and `textarea-wrapper`; the inner combobox input and textarea keep their own slots for text-specific rules. Put borders, backgrounds, radii, hover states, and focus treatment on the complete surface rather than its inner input.

Buttons inset into plain inputs expose `data-slot="input-action"`. This is the
interactive counterpart to a select or combobox's `select-icon`; themes can give both the
same trailing-well treatment while leaving their positioning to the controls.
Every select-like trigger exposes `data-control="select"`: the Select trigger,
editable comboboxes, the toolbar's group/view dropdowns, and the searchable
timezone button. Use that marker for shared dropdown-field styling; the
`select-trigger` slot identifies only the real Select component.

The `select-icon` slot owns its arrow's colour and visibility; the glyph inside
draws with `currentColor`. A theme can recolour the arrow through the slot's
`color`, or set it to `transparent` and draw its own glyph with a pseudo-element.

Removable list rows in the event form, such as reminders and conference links,
expose `data-variant="item"` on their `data-control-layout="row"` root. They use
the `accent` / `accent-foreground` pair while hovered or focused within.

Themes that intentionally retain an inset event action can scope that exception to the footer:

```css
[data-slot="event-form-footer"] {
  padding-inline: 8px;
}
```

Older custom rules that painted `[data-slot="input-group"]` inside a combobox should move that surface styling to `[data-slot="combobox"]`.

## Compatibility

The first release with this contract renames the old text token `--muted` to `--muted-foreground`; `--muted` now has shadcn's surface meaning. External themes using only the old name are reported in Settings. The old `--divider` token is no longer supported; use `--border`. `--radius-base` → `--radius` and `--mono`/`--sans` → `--font-mono`/`--font-sans` retain one-release fallbacks.

### Settings styling hooks

Settings sections use vertical Tabs. Their `tabs-list` exposes
`data-variant="navigation"`, with standard `tabs-trigger` slots and
`data-state="active"` / `"inactive"` selection states. This variant lets themes
style navigation independently of property-sheet tabs while retaining Radix
keyboard navigation and tab/panel accessibility.

Calendar groups use the same vertical navigation tabs as the settings sidebar,
including the standard `tabs-list` / `tabs-trigger` slots and selection states.
Group menu actions remain separate from their tab triggers.

Each settings page's scrolling pane exposes `settings-content`. On Linux and
Windows, the settings window's own close button exposes `settings-close`; macOS
uses the native title bar instead. The calendar colour dialog's hue slider is a
native range input exposing `hue-slider`, so its WebKit slider pseudo-elements
can be styled.

Toasts are rendered by Sonner. Style them through its `data-sonner-toast`
attribute and `data-type` (`success`, `info`, `warning`, `error`).

### Calendar shell styling hooks

The main view fills the space below its toolbar using flex sizing; toolbar padding
and control height can change without a fixed viewport-height offset.

Calendar chrome exposes these slots for scoped theme rules:

- `main-toolbar`, `calendar-viewport`, `sidebar`, `sidebar-header`, `sidebar-toolbar`;
- `minical-header`, `minical-title`, `minical-year`, `minical-navigation`,
  `calendar-weekday`, `calendar-day`, `calendar-event-dots`;
- `agenda`, `agenda-scroll`, `agenda-day`, `agenda-date`, `agenda-day-label`,
  `agenda-date-label`, `agenda-empty`, `agenda-all-day-events`;
- `month-scroll`, `month-weekdays`, `month-weekday`, `month-week`, `month-date`,
  `month-day`, `month-day-number`, `month-create-selection`;
- `board-column` and `board-column-header`; today's header exposes
  `data-today="true"`;
- `calendar-event`, `calendar-event-title`, `calendar-event-time`, and
  `calendar-event-color-marker` for events in every view;
- `select-icon` on select triggers and the toolbar's group/view dropdowns.

Toolbar group/view dropdowns retain their button slot and, like every
select-like trigger, expose `data-control="select"`. The searchable timezone
dropdown exposes that control marker and `select-icon` on its trailing arrow. Its button intentionally keeps
the `popover-trigger` slot: composed triggers retain their primitive slot and
use control markers for cross-primitive styling. Mini-calendar navigation
buttons expose `data-direction="previous"` / `"next"`. Month dates and day
bodies expose `data-active="true"`; day numbers expose `data-today="true"`.
Mini-calendar day buttons expose `calendar-day` (replacing the generic button
slot; `data-button` remains) and retain their explicit `true`/`false` selection
attributes, and their selection styles can be overridden without `!important`.

### Calendar event styling hooks

Every rendered event uses `data-slot="calendar-event"`. The `data-view` values
are `week`, `month`, `agenda`, `board`, `search`, and `drag-overlay`; the
`data-kind` values are `timed` and `all-day`. The stable child slots are
`calendar-event-title`, `calendar-event-time`, and
`calendar-event-color-marker`; a part is omitted when that rendering does not
need it.

Event state is metadata on the same element that owns its visual treatment:

- `data-highlighted="true"` marks selection or an open context menu;
- `data-rsvp` exposes `accepted`, `tentative`, `declined`, or `needs-action` for
  the current user and is omitted when the event has no applicable response;
- `data-draft="true"` and `data-dimmed="true"` expose transient editor states;
- `data-drag-state` uses `source`, `preview`, or `overlay` to distinguish the
  original block, its drop-position preview, and the pointer-following copy.

False boolean states are omitted. `data-event-clickable` is an internal
interaction marker; style `calendar-event` instead.

The app sets only `--calendar-event-color` inline. Backgrounds, foregrounds,
borders, opacity, and shadows are CSS, so ordinary theme selectors can override
them without `!important`. Hover uses `--hover`. On unfilled blocks,
`data-highlighted` paints with `--selected`; filled blocks use
`--calendar-event-selected-fill`. The derived `--calendar-event-fill`,
`--calendar-event-selected-fill`, `--calendar-event-foreground`, and
`--calendar-event-tinted-foreground` custom properties are also available on
each event. Inline `top`, `left`, `width`, `height`, and grid placement are
layout geometry and must be preserved.

The `agenda` slot is the fixed outer frame: apply backgrounds, borders, shadows,
and padding there. Its `agenda-scroll` child owns scrolling and clips the day
sections and sticky date headers inside that frame. Set scrollbar and overflow
rules on `agenda-scroll`. Scroll padding is inherited from `agenda` unless
overridden on `agenda-scroll`, so existing theme scroll-padding rules still apply.

Scrollbars remain hidden by default. Set `--scrollbar-width: auto` to restore
native scrollbars; WebKit scrollbar pseudo-elements can customize their appearance.
Themes should preserve the calendar's scroll containers, virtual row heights, and
event positioning when styling these slots. Month date labels always align to the
right; the calendar enforces this alignment with an important utility. Themes can
style their typography and surfaces, but should not reposition them.

Buttons also expose `data-button=""`. Use this attribute for button surface rules:
Radix `asChild` composition may replace `data-slot` with `tooltip-trigger`,
`dropdown-menu-trigger`, or another trigger slot. `data-button` survives that
composition while each trigger keeps its own slot. The collapsible sidebar draft
exposes `sidebar-draft` for adjusting the space above its content.

### Week view styling hooks

Week view exposes `week-scroll`, `week-header`, `week-header-gutter`,
`week-day-header`, `week-weekday`, `week-day-number`, `week-all-day`,
`week-time-grid`, `week-time-gutter`, and `week-hour-label`. Timed columns expose
`week-day`; all-day lane wrappers expose `week-all-day-lane`. Headers, all-day
backgrounds, and timed columns expose `data-active="true"` for the selected date;
day numbers expose `data-today="true"`. False states omit these attributes.

Week events use the shared calendar-event contract above. The all-day lane
wrapper retains `week-all-day-lane`; it is geometry rather than event paint.

`--week-grid-background` optionally replaces the timed columns' background image.
Use the app-provided `--week-hour-height` measurement to align custom grid lines
and gutter backgrounds. This measurement is read-only: changing it does not
change event positioning or pointer-to-time conversion. Preserve the grid's
column widths, height, scrolling, and positioned event geometry.

`--event-tint-surface` sets the surface mixed with calendar/event colours in
filled blocks and drafts (default: `--background`). Unlike `--event-background`,
it preserves per-event colours. It can be scoped to `week-scroll` to give the
week's events lighter fills independently of the calendar canvas. Solid event
background overrides, selection, RSVP borders, and drag-preview rings still apply.
