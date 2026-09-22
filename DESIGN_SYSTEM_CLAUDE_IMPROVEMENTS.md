# Design system review: contract fixes before 0.8.0

Review of the theming contract as it stands on the `adjust-styling` branch
(PR #156), tested against `rencal-theme-gruvbox` (palette-only theme) and
`rencal-theme-windows98` (full reskin via `data-slot` rules).

**Verdict:** the direction is right. Merge the PR, then fix the items under
"Contract bugs" and "Breaking cleanups" in a follow-up before tagging 0.8.0.
Once themes and plugins exist, every one of these becomes a breaking change.

What is already right and must not change:

- `@theme inline` mapping, so utilities resolve tokens on the element that uses them.
- Derived tokens declared on `[data-theme]`, not `:root` or `body`.
- Theme CSS is unlayered, so it wins over Tailwind utilities without `!important`.
- The `--hover-tint` / `--hover-mix` derivation chain.
- Bare declaration blocks wrapped in `[data-theme="<id>"]` with native nesting.
- `data-button=""` as a role marker that survives Radix `asChild` composition.

## Contract bugs (fix before tagging)

### 1. Font tokens do not propagate from a theme

Confirmed in headless Chromium. `--font-body: var(--font-sans)` and the
`--font-heading/button/numerical: var(--font-mono)` defaults live only in the
`:root, [data-theme="ren"]` block of `src/global.css`. `data-theme` is set on
`<body>` (`src/hooks/useTheme.ts`), so those `var()`s resolve on `<html>` with
ren's fonts and are inherited as literals. A theme that sets only `--font-sans`
or `--font-mono`, exactly what the README's "Pasting a shadcn theme" section
promises, changes nothing.

Gruvbox sets no fonts and Windows 98 sets all six explicitly, which is why it
went unnoticed.

- Move the four role defaults into the `[data-theme]` derived block, the same
  pattern already used for `--placeholder-foreground` and `--control-icon-size`.
- Add a rule and a test in `src/global-css.test.ts`: any token whose value is
  `var(...)` of another token must be declared on `[data-theme]`.

### 2. Token semantics drift between primitives

In ren, `--hover` = `--secondary` = `--muted`, and `--accent` is two tint
layers heavier, so swapping them is invisible. Under a real shadcn palette
(any tweakcn export, or Windows 98's navy `--accent` + white
`--accent-foreground`) it breaks. Found mismatches:

| Location                                                                                        | Background                      | Foreground                     | shadcn upstream                                     |
| ----------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------ | --------------------------------------------------- |
| `ui/select.tsx` item                                                                            | `focus:bg-hover`                | `focus:text-accent-foreground` | accent / accent-foreground                          |
| `ui/command.tsx` item                                                                           | `data-[selected=true]:bg-hover` | `text-accent-foreground`       | accent / accent-foreground                          |
| `ui/button.tsx` ghost                                                                           | `hover:bg-hover`                | `hover:text-accent-foreground` | accent / accent-foreground                          |
| `ui/dialog.tsx` close                                                                           | `data-[state=open]:bg-accent`   | `text-muted-foreground`        | accent / muted-foreground (upstream bug too)        |
| `ui/dropdown-menu.tsx`, `ui/context-menu.tsx` items                                             | `focus:bg-accent`               | `focus:text-accent-foreground` | matches                                             |
| Agenda `DaySection`, `BoardCard`, `ThemesPage` tile, `ConferenceDisplay`, `ReminderSelect` rows | `hover:bg-secondary`            | inherit                        | accent (list hover), not secondary (button surface) |
| `settings/plugins/PluginsPage.tsx`                                                              | `bg-muted/10`                   |                                | muted is already a 5% tint in ren; invisible        |

Rules to adopt and document:

- Never pair `bg-X` with `text-Y-foreground` for X ≠ Y.
- `accent` = interactive highlight/hover surface, always with `accent-foreground`.
- `secondary` = secondary button surface only.
- `muted` = static de-emphasized surface.
- `hover` = transparent tint with no paired foreground; text inherits.
- If ren wants lighter menu highlights than accent gives, tune ren's derivation
  in `global.css`, not the component.
- Add a hidden debug theme with garish, distinct values per token (secondary
  red, accent blue, muted green, card yellow, hover magenta, popover cyan) so
  misuse is visible at a glance.

### 3. Windows 98 had to reach past the contract

The theme depends on undocumented interaction plumbing. Renaming any of it
after 0.8.0 breaks the theme silently.

| Hook                    | Uses in `src/` | In README |
| ----------------------- | -------------- | --------- |
| `data-event-clickable`  | 10             | no        |
| `data-drop-zone`        | 5              | no        |
| `data-drag-scroll`      | 4              | no        |
| `data-date-key`         | 3              | no        |
| `data-create-selection` | 2              | no        |
| `data-agenda-item`      | 2              | no        |
| `data-control-surface`  | 7              | no        |

It also uses `#root` and descendant selectors on unslotted children:
`[data-slot="minical-title"] span`, `[data-slot="agenda-date"] span`,
`[data-slot="minical-navigation"] button`.

Missing slots:

- Board view has none (`main/board-view/*`: 0 `data-slot`). Add `board`,
  `board-column`, `board-column-header`, `board-card`.
- Agenda has `agenda-all-day-events` (container) but no slot on the single
  all-day block (`events-blocks/agenda/AllDayEventBlock.tsx`).
- `data-event-clickable` is the only hook covering "every event block". Add
  one documented role marker for event blocks, in the spirit of `data-button`.
- Either document `data-drop-zone` values as stable or give day cells a slot.
- Document `data-control-surface` or fold it into an existing attribute.

### 4. Three ways to mark a select-like trigger

- Radix Select: `data-slot="select-trigger"` (`ui/select.tsx`).
- Toolbar group/view dropdowns: `data-slot="button"` + `data-control="select"` (`main/MainHeader.tsx`).
- Timezone picker: `data-control="select"` + `select-trigger` (`event-parts/inputs/TimeZoneSelect.tsx`).
- Combobox: `data-slot="combobox"` + `data-control="select"` (`ui/combo-box.tsx`).

Windows 98 writes `:is([data-control="select"], [data-slot="select-trigger"])`
everywhere. Pick one rule: every select-like trigger carries
`data-control="select"` regardless of implementation, and `select-trigger`
stays only on the real Radix Select.

## Breaking cleanups (same follow-up)

- **Deprecated alias used internally.** `border-r-divider` / `border-b-divider`
  / `stroke-divider` in `sidebar/Sidebar.tsx`, `windows/SettingsWindow.tsx`,
  `ui/popover.tsx`, `settings/SettingsSidebar.tsx`,
  `sidebar/agenda/DaySection.tsx`, `settings/calendars/GroupsColumn.tsx`.
  Switch to `border` / `stroke-border` and drop `--color-divider` from
  `@theme inline`.
- **Generic global class names.** Typography roles ship as `.button` (28 uses),
  `.numerical` (14), `.heading` (6), `.field-action` (2) in `@layer components`.
  A plugin rendering its own `<a class="button">` gets uppercase mono text.
  Prefix them or select on the existing `data-typography` attribute.
- **Important utilities punch holes in the cascade.** Theme CSS can only
  override these with `!important`: `bg-accent!` (`sidebar/agenda/DaySection.tsx`,
  `events-blocks/month-view/TimedEventBlock.tsx`), `bg-weekend!` /
  `bg-transparent!` (`sidebar/minical/Calendar.tsx`), `justify-end!`
  (`main/month-view/TopLeftDate.tsx`), `outline-none!` (`ui/textarea.tsx`),
  `h-7!` (`windows/SettingsWindow.tsx`). Replace selected-beats-hover cases with
  ordered state variants such as `not-data-highlighted:hover:bg-accent`.
- **Circle radius is half-migrated.** 12 `rounded-full` vs 10 `rounded-circle`.
  A sharp theme still gets round invite badges, sync badge, theme-selected
  check, colour swatches, status dots. Decide whether those are always round
  and document it, or migrate them.
- **Boolean attribute shapes.** renCal attributes (`data-active`, `data-today`,
  `data-highlighted`) are present-when-true; Radix emits empty-valued booleans;
  react-day-picker emits explicit `"true"`/`"false"`. Fine, but write the rule
  down: renCal attributes are present or absent, third-party attributes keep
  their upstream shape.

## Additive gaps (non-breaking, cheap now)

- **Sidebar tokens.** Every tweakcn export sets `--sidebar`,
  `--sidebar-foreground`, `--sidebar-border`, `--sidebar-accent`; renCal
  ignores them on its largest surface. Default them to the background tokens on
  `[data-theme]` and consume them in `sidebar/Sidebar.tsx`.
- **Settings has zero slots** across 18 files; shortcuts overlay and sync dialog
  have none either. Add page chrome slots: `settings`, `settings-sidebar`,
  `settings-content`, `settings-section`.
- **Input group addon dropped shadcn's `data-align`** for `data-control-part`.
  Keep the renCal attribute, since it spans control rows, but note the
  divergence in the README for shadcn users.
- **Website playground** (`website/src/styles/themes.css`) duplicates the
  derivation by hand with a "keep in sync" comment, and `.tp-seg button` still
  reads `var(--muted)` as a text colour (the old meaning). Generate from
  `src/global.css` or import the same file.
- **`--spacing` from a theme** scales all Tailwind spacing. Undocumented density
  knob; test against fixed geometry (hour height, gutters) before documenting.

## Suggested order

1. Merge PR #156.
2. Follow-up PR: items 1–4, alias cleanup, class-name prefix, `!` utilities.
3. Update `src/themes/README.md` and `website/src/content/docs/docs/themes.md`
   with the new rules (token pairing, attribute shapes, select marker, event
   block marker).
4. Tag 0.8.0.
5. Sidebar tokens, settings slots, playground dedupe can follow in 0.8.x.
