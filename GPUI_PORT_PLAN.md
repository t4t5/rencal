# renCal GPUI port plan

Status: Phases 0–5 implemented (2026-10-07); Phase 5 awaiting review/commit; Phase 6 next. Phase 1–5 notes are under their phases in §8. Plan written 2026-10-07 on the `gpui` branch at `f688129a`.
Audience: the agent that implements the port. Read this whole file before starting a phase, and read the linked repo docs before touching the area they cover.

This plan ports renCal from Tauri v2 (Rust backend + React webview) to a native Rust app on [GPUI](https://www.gpui.rs/) via [gpui-kit](https://gpui-kit.com/) (`gpui-kit` 0.7.x, Longbridge). It also replaces the CSS theme system with a Zed-style token theme format (see [Zed's theme builder](https://zed.dev/theme-builder) and its schema at `https://zed.dev/schema/themes/v0.2.0.json`).

---

## 0. Goals and non-goals

Goals

- Feature parity with the current Tauri app on Linux (Omarchy/Hyprland, Wayland first) and macOS.
- One language: all UI, layout, time, and parsing logic in Rust, testable without a window.
- A new theme system: JSON theme families with flat, dotted, typed tokens (Zed style), plus a small set of non-colour style tokens so heavily styled themes (windows98, skeuomorphic) stay possible without CSS.
- Keep the plugin system (manifest, installer, catalog, provider binaries) and the caldir data model unchanged except for the theme/font contribution format.

Non-goals for this port

- Windows support (GPUI supports it; don't preclude it, but don't test it). See the existing Windows port notes in the wiki.
- New features. Port behaviour as specified in `docs/*.md`; fix bugs only when the port forces it.
- JavaScript plugin views / generated views (`gpui-shell` is milestone M0). Future work: a declarative view spec interpreted in Rust; keep the view registry open (no closed `enum CalendarView` match in many places) so a board-like plugin view can slot in later.
- Back-compat shims for the old CSS theme contract. Old CSS themes are converted once, by tooling, not read by the app.

## 1. Locked decisions

| #   | Decision                                                                                                                                                                                                                                                                                        | Why                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | UI on `gpui-kit` 0.7.x (`gpui_kit::component` for styled widgets, `gpui_kit::base` where we need unstyled behaviour). Pin the exact version; GPUI comes from pinned `gpui-pre-*` snapshots whose API can change. Upgrade deliberately, never via caret drift.                                   | gpui-kit pins GPUI itself and ships Popover, Menu, Tooltip, Dialog, Sheet, Notification, Command, Select, Combobox, Input/Textarea, DatePicker, TimeField, ColorPicker, Tabs, Sidebar, TitleBar, VirtualList, Scrollable. |
| D2  | Strangler migration in one repo: extract the Tauri-free backend into shared crates first, keep the Tauri app building until the GPUI app reaches parity, then delete `src/` and the Tauri shell.                                                                                                | The Tauri app is the reference implementation and the source of golden test fixtures.                                                                                                                                     |
| D3  | Theme format v2: Zed-style JSON theme family (`themes: [{ name, appearance, style }]`), flat dotted token keys, `#RRGGBB[AA]` colours, **plus** typed non-colour tokens (metrics, typography, per-slot style: fill/gradient, border, border style incl. bevels, shadows). No selectors, no CSS. | Chosen by the user over colour-only: keeps windows98/skeuomorphic viable.                                                                                                                                                 |
| D4  | Derivation lives in Rust (`rencal-theme`): a theme may set only a few primitives and every other token derives from them, exactly as the `color-mix()` chains in `src/global.css` do today. The website theme builder uses the same resolver compiled to wasm.                                  | Short themes and the Omarchy palette (only ~10 colours) need derivation anyway; one implementation avoids drift.                                                                                                          |
| D5  | Plugin fonts are TTF/OTF only (contract change). No WOFF2 decoding in the app.                                                                                                                                                                                                                  | GPUI's text system loads TTF/OTF; the theme contract breaks anyway.                                                                                                                                                       |
| D6  | Async: keep tokio for backend work (reqwest, `notify`, watch channels). Run a tokio runtime on background threads and bridge into GPUI tasks (`gpui_tokio` if the pinned snapshot ships it, else a ~30-line equivalent `Global` holding a `tokio::runtime::Handle`).                            | `AppState` and watchers already use tokio; tokio sync primitives are executor-agnostic.                                                                                                                                   |
| D7  | Packaging/updates with `cargo-packager` (+ `cargo-packager-updater`, minisign-compatible) replacing the Tauri bundler/updater. Verify it still fits before Phase 6; fallback is a hand-written updater (fetch `latest.json`, `minisign-verify`, replace AppImage/app bundle).                   | Tauri bundler and `tauri-plugin-updater` go away.                                                                                                                                                                         |
| D8  | Infinite month/week scrolling uses a custom `InfiniteAxis` element whose scroll position is a fractional item index from a fixed origin, not pixels.                                                                                                                                            | Removes prepend anchoring and resize rescaling entirely (see §6.1).                                                                                                                                                       |

## 2. What exists today (inventory)

Sizes: `src/` ≈ 25k LOC TS/TSX (191 `.tsx`, 121 `.ts`, 48 test files ≈ 5.8k LOC, 886 LOC CSS). `src-tauri/src` ≈ 14k LOC Rust (`plugins/installer.rs` alone 4.1k). Workspace crates in `src-tauri/`: `reminder-core`, `plugin-contract`, `plugin-indexer`, `rencal-config`, `notifierd`.

Backend (`src-tauri/src`) — mostly already Tauri-free:

- `state.rs`: `AppState` is explicitly Tauri-free and exposes changes as tokio `watch` channels. `state_bridge.rs` turns them into webview events. **Read the module docs of `state.rs`, `state_bridge.rs`, `watchers/mod.rs`, `fs_watch.rs`, `tasks.rs` first.**
- `events.rs`: `AppEvent` enum is the full notification contract (caldir config, calendars, events, providers, deep links, rencal config, system tz, omarchy theme, external themes, menu action, theme changed). In GPUI each becomes an entity/global update + `cx.notify()`.
- `routes/caldir/*.rs`: event/calendar operations; most files are plain functions with no Tauri imports. `routes/mod.rs`, `routes/caldir/mod.rs`, `routes/caldir/types.rs`, `routes/error.rs` carry taurpc/specta glue.
- Tauri-coupled modules to adapt: `lib.rs`, `deep_links.rs`, `external_themes.rs`, `omarchy.rs`, `notifications.rs`, `macos_notifications.rs`, `menu.rs`, `single_instance.rs`, `plugins/installer.rs`, `watchers/{mod,plugins,rencal_config,tz}.rs`, `routes/{config,omarchy,platform,plugins,themes}.rs`, `routes/caldir/connect_provider*.rs`.
- Disappear with the webview: `nvidia_workaround.rs` (WebKitGTK), `state_bridge.rs`, `events.rs` TS export, `examples/gen_types.rs`, `src/rpc/*`.

Frontend (`src`) — everything here is rewritten:

- Views: `components/main/{month-view,week-view,board-view}`, `MainHeader.tsx`; sidebar (`sidebar/header` compose input + `FlyAnimation.tsx`, `sidebar/minical`, `sidebar/agenda`); toolbar (sync status, invites badge, search, settings button); settings window (`windows/SettingsWindow.tsx`, `components/settings/*`: general, calendars, accounts, reminders, themes, plugins).
- State: React contexts in `src/contexts/` (calendar state, events, draft, drag, delete, duplicate, recurrence edit, settings, sync, agenda focus, create gate) and `localStorage` (view, sidebar collapse, theme bootstrap cache).
- Domain logic in TS that must be ported: `lib/event-time/*` (Temporal-based; spec `docs/event-time-system.md`), `hooks/cal-events/*` (overlap layout, all-day lanes, month layout), `lib/event-drag.ts`, `lib/drag-to-create.ts`, `lib/magic-parser.ts` (chrono-node), `lib/rrule-utils.ts` (rrule.js), `lib/conference.ts`, `lib/contact-suggestions.ts`, `lib/calendar-groups.ts`, `lib/shortcuts.ts`, `lib/palette-commands.ts`, `lib/event-url.ts`, `lib/save-event.ts`.
- Specs to treat as requirements: `docs/scroll-behaviour.md`, `docs/drag-to-reschedule.md`, `docs/drag-to-create.md`, `docs/event-time-system.md`, `docs/notifications.md`, `src/themes/README.md` (token semantics only), agenda keyboard nav in `src/components/sidebar/agenda/`.

## 3. Target architecture

### 3.1 Workspace layout

Phase 0 moves the Cargo workspace root from `src-tauri/Cargo.toml` to the repo root. Existing crates stay where they are until cutover to keep the diff small.

```
Cargo.toml                 workspace root (members below)
crates/
  rencal-core/             Tauri-free backend extracted from src-tauri/src:
                           AppState, watchers, fs_watch, event_cache, tasks, caldir operations
                           (from routes/caldir/*), plugins + installer, external theme/font loading,
                           omarchy palette, oauth server, deep-link parsing, notifications (Linux),
                           skill_install, single_instance. Feature `specta` adds the derives the
                           Tauri app needs; the GPUI app builds without it.
  rencal-time/             EventTime model, projections (dateInfo), ranges, edits, display
                           formatting, tz labels. Port of src/lib/event-time + lib/cal-events.
  rencal-layout/           Pure geometry: week overlap columns, all-day lanes, month lanes,
                           drag-to-reschedule and drag-to-create math.
  rencal-text/             magic parser, conference detection, contact suggestions,
                           recurrence (RRULE) editing model.
  rencal-theme/            Theme v2 types, JSON schema (schemars), resolver/derivation, built-in
                           themes, legacy CSS → v2 converter (feature `legacy-css`), wasm bindings
                           (feature `wasm`) for the website.
  rencal-app/              The GPUI binary (`rencal`). Views, entities, actions, platform glue.
src-tauri/                 Tauri app (depends on rencal-core with `specta`); deleted at cutover,
                           except the workspace crates below, which move to crates/ then.
src-tauri/{reminder-core,plugin-contract,plugin-indexer,rencal-config,notifierd}
src/                       React app; deleted at cutover.
website/                   Astro site; theme builder + docs updated in Phase 7.
```

Every new crate directory gets an `AGENTS.md` (with a `CLAUDE.md` symlink to it, matching the rest of the repo).

Keep the pure crates (`rencal-time`, `rencal-layout`, `rencal-text`, `rencal-theme`) free of GPUI. Geometry types there use plain `f32`; `rencal-app` converts to `Pixels`.

### 3.2 Runtime and threading

- `main()` → `gpui_kit::application().run(|cx| { gpui_kit::init(cx); … })`.
- Start one tokio multi-thread runtime at startup; store its `Handle` in a GPUI `Global`. Backend futures run there; UI code awaits their `JoinHandle`s from `cx.spawn` and applies results with `entity.update(cx, …)`.
- Each `AppState` watch channel (`subscribe_caldir_config`, `subscribe_calendars_changed`, `subscribe_events_changed`, `subscribe_providers_changed`, plus the rencal-config / tz / omarchy / external-themes / plugins watchers) gets one long-lived `cx.spawn` loop that awaits `changed()` and updates the owning entity. This replaces `state_bridge.rs` and `AppEvent`.
- Never do caldir file IO on the main thread.

### 3.3 State model (React contexts → GPUI entities/globals)

| Today                                                                                         | GPUI                                                                                                                          | Notes                                                                                                                    |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `SettingsContext`, `lib/api/settings.ts`                                                      | `Settings` global (`RencalConfig` + caldir settings)                                                                          | Writes go through `rencal-core`; the config watcher updates the global.                                                  |
| `ThemeController`, `ThemeRegistry`, `useOmarchyTheme`, `useWindowTheme`, `bootstrap-cache.ts` | `ThemeStore` global (§4)                                                                                                      | No flash-prevention cache needed: the theme resolves before the first window opens.                                      |
| `CalendarStateContext`, `useCalendarView`, `navigateToDate`                                   | `Navigation` entity: active date, view, selected event, active calendar group                                                 | Keep the "navigate vs raw set" distinction (`src/AGENTS.md` → Navigation).                                               |
| `CalEventsContext`, `hooks/cal-events/useInfinite*`, `lib/api/calendar-events.ts`             | `EventStore` entity: range-keyed loading, `dateInfo` projection, recompute on viewer-tz change, optimistic overlay + rollback | Load is best-effort and must never block scrolling.                                                                      |
| `EventDraftContext`, `CreateEventGateContext`, `useOpenDayDraft`                              | `DraftState` entity                                                                                                           |                                                                                                                          |
| `EventDragContext`, `useDragToCreateSession`                                                  | `DragSession` owned by the grid view                                                                                          | §6.2                                                                                                                     |
| `DeleteEventContext`, `RecurrenceEditContext`, `DuplicateEventContext`, `lib/save-event.ts`   | `EventCommands` service + gpui-kit `Dialog`s that resolve a recurrence scope asynchronously                                   | Keep undo toasts.                                                                                                        |
| `SyncContext`                                                                                 | `SyncState` entity                                                                                                            |                                                                                                                          |
| `AgendaFocusContext`, `useEventPopoverTabTrap`                                                | GPUI `FocusHandle`s, focus scopes, key contexts                                                                               |                                                                                                                          |
| `localStorage` (`calendarView`, sidebar collapse, …)                                          | `UiState` persisted as JSON in the XDG state dir (`~/.local/state/rencal/ui.json`)                                            | Corrupt file → defaults.                                                                                                 |
| `lib/api/*` facade                                                                            | Direct calls into `rencal-core`                                                                                               | The app-API boundary rule survives as "views never touch caldir directly; they go through `EventStore`/`EventCommands`". |

### 3.4 Window and view tree

```
Main window (gpui-kit Root: hosts dialogs, notifications, popovers)
├─ TitleBar (client-side decorations on Linux; window drag region; MainHeader content)
│   └─ nav arrows, month/year label, view switcher, SyncStatus, InvitesBadge, Search, Settings, ToggleSidebar
├─ Sidebar (collapsible)
│   ├─ SidebarHeader: ComposeEventButton / ComposeEventInput + MagicSegments
│   ├─ Minical (event dots)
│   └─ Agenda (infinite day sections, keyboard nav)
├─ Main: MonthView | WeekView | BoardView   (open registry keyed by view id)
└─ Overlays: EventPopover (new/edit), EventSheet (narrow layout), context menus,
   CommandPalette, SearchPalette, ShortcutsOverlay, PluginInstallDialog,
   MassDeleteConfirmDialog, RecurrenceConfirmDialog, DeleteConfirmDialog, UpdateChecker
Settings window (second window, single instance; opened by action)
└─ SettingsSidebar + pages: General, Calendars, Accounts, Reminders, Themes, Plugins
```

Breakpoints (`useBreakpoint.ts`, `--breakpoint-xs: 380px`) become window-width checks in `render`.

### 3.5 Actions and keymap

- Port the table in `src/lib/shortcuts.ts` to a static Rust table of `{ id, label, group, bindings }`, and declare one GPUI action per id with `actions!(rencal, [NextDay, PrevDay, NextWeek, …])`. The same table feeds the shortcuts overlay, the command palette (`lib/palette-commands.ts`) and tooltips (`shortcut-tooltip.tsx`).
- Single-character bindings (`h j k l t . m b w g c a d i s /`) are bound in a `CalendarView` key context only, so text inputs never trigger them. `mod+` bindings are global.
- Keep `website/src/content/docs/docs/keyboard-shortcuts.md` in sync.

## 4. Theme system v2

### 4.1 Format

A theme file is a **theme family** (one JSON file, one or more variants), modelled on Zed:

```json
{
  "$schema": "https://rencal.org/schema/themes/v1.json",
  "name": "Ren",
  "author": "renCal",
  "themes": [
    {
      "name": "Ren",
      "appearance": "dark",
      "style": {
        "background": "#131313ff",
        "text": "#ffffffff",
        "primary": "#f56313ff",
        "surface.tint": "#ffffffff",
        "surface.tint_step": 0.05,
        "radius": 0,
        "typography.heading.transform": "uppercase"
      }
    },
    {
      "name": "Ren Light",
      "appearance": "light",
      "style": {
        "background": "#fafafaff",
        "text": "#131313ff",
        "primary": "#e2530aff",
        "today": "#1f75e0ff"
      }
    }
  ]
}
```

Rules:

- Keys are flat, dotted, snake_case. Group prefixes follow Zed where an equivalent exists (`text.*`, `border.*`, `element.*`, `ghost_element.*`, `elevated_surface.*`, `scrollbar.*`, status colours).
- Colours: `#RGB`, `#RRGGBB`, `#RRGGBBAA`. `null` means "unset, use the derived/default value".
- Unknown keys and invalid values are ignored with a diagnostic (surfaced in Settings → Themes for user/plugin themes); a theme never fails to load because of one bad key.
- The JSON Schema is generated from the Rust types with `schemars`, committed, and published by the website at `/schema/themes/v1.json`.
- Theme ids: built-ins use their file stem plus slugified variant name when a family has several (`ren`, `ren-light`); user themes `user:<slug>`; plugin themes keep the namespacing currently implemented in `src-tauri/src/plugins/mod.rs` / `external_themes.rs`.

### 4.2 Resolution order

For every token: explicit value in the theme → derivation rule evaluated against this theme's resolved tokens → value from the baseline theme of the same appearance (`ren` for dark, `ren-light` for light). Derivations are acyclic; add a test that resolves every built-in and fails on cycles.

Colour mixing must reproduce CSS `color-mix(in srgb, a p%, b)` exactly, including premultiplied alpha when one side is `transparent`. Parity target: every built-in theme's resolved colours equal the values the current webview computes, within ±1/255 per channel (fixtures from Phase 0).

### 4.3 Colour token catalogue (old CSS variable → new token)

Derivation column restates `src/global.css`; `step` = `surface.tint_step`, `tint` = `surface.tint`.

| Group      | New token                                                                                      | Old variable                                                         | Default / derivation                                                    |
| ---------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Primitives | `background`                                                                                   | `--background`                                                       | baseline                                                                |
|            | `text`                                                                                         | `--foreground`                                                       | baseline                                                                |
|            | `surface.tint`                                                                                 | `--surface-tint`                                                     | `text`                                                                  |
|            | `surface.tint_step` (number 0–1)                                                               | `--surface-tint-step`                                                | `0.05`                                                                  |
|            | `primary`                                                                                      | `--primary`                                                          | baseline                                                                |
| Text       | `text.muted`                                                                                   | `--muted-foreground`                                                 | `text` at 50% alpha                                                     |
|            | `text.placeholder`                                                                             | `--placeholder-foreground`                                           | `text.muted`                                                            |
| Surfaces   | `surface.background`                                                                           | `--card`                                                             | mix(tint, step, background) solid                                       |
|            | `surface.text` / `surface.text.muted`                                                          | `--card-foreground` / `--card-muted-foreground`                      | `text` / `text.muted`                                                   |
|            | `elevated_surface.background`                                                                  | `--popover`                                                          | mix(tint, step, background) solid                                       |
|            | `elevated_surface.text` / `.text.muted`                                                        | `--popover-foreground` / `--popover-muted-foreground`                | `text` / `text.muted`                                                   |
|            | `sidebar.background`                                                                           | `--sidebar`                                                          | `background`                                                            |
|            | `tooltip.background`                                                                           | `--tooltip`                                                          | mix(tint, 15%, background)                                              |
|            | `tooltip.text` / `.text.muted`                                                                 | `--tooltip-foreground` / `--tooltip-muted-foreground`                | `text` / `text.muted`                                                   |
|            | `toast.background`                                                                             | `--toast`                                                            | dark: `elevated_surface.background`; light: `text` (inverted)           |
|            | `toast.text` / `.text.muted`                                                                   | `--toast-foreground` / `--toast-muted-foreground`                    | dark: `elevated_surface.text`; light: `background`; muted = text at 60% |
|            | `overlay`                                                                                      | `--overlay`                                                          | as in `global.css`                                                      |
| Border     | `border`                                                                                       | `--border`                                                           | tint at 3×step over transparent                                         |
|            | `border.input`                                                                                 | `--input`                                                            | tint at 4×step                                                          |
|            | `border.focused`                                                                               | `--ring`                                                             | baseline                                                                |
|            | `button.border`                                                                                | `--button-border`                                                    | transparent                                                             |
| Element    | `ghost_element.hover`                                                                          | `--hover`                                                            | tint at 1×step (no paired text colour)                                  |
|            | `element.background`                                                                           | `--secondary`                                                        | tint at 1×step                                                          |
|            | `element.hover`                                                                                | `--secondary-hover`                                                  | one step over `element.background`                                      |
|            | `element.text` / `.text.muted`                                                                 | `--secondary-foreground` / `--secondary-muted-foreground`            | `text` / `text.muted`                                                   |
|            | `element.highlight`                                                                            | `--accent`                                                           | tint at 3×step (transient: menus, keyboard focus, ghost buttons)        |
|            | `element.highlight.text` / `.text.muted`                                                       | `--accent-foreground` / `--accent-muted-foreground`                  | `text` / `text.muted`                                                   |
|            | `element.selected`                                                                             | `--selected`                                                         | tint at 4×step (persistent selection)                                   |
|            | `element.selected.text` / `.text.muted`                                                        | `--selected-foreground` / `--selected-muted-foreground`              | `text` / `text.muted`                                                   |
|            | `element.muted`                                                                                | `--muted`                                                            | tint at 1×step (static)                                                 |
|            | `control.active.background`                                                                    | `--control-active-background`                                        | `element.background`                                                    |
|            | `control.active.border`                                                                        | `--control-active-border`                                            | transparent                                                             |
| Accents    | `primary.hover`                                                                                | `--primary-hover`                                                    | mix(white, step, primary)                                               |
|            | `primary.text`                                                                                 | `--primary-foreground`                                               | `background`                                                            |
|            | `today` / `today.text`                                                                         | `--today` / `--today-foreground`                                     | `primary` / `primary.text`                                              |
|            | `brand` / `brand.hover` / `brand.text`                                                         | `--brand` / `--brand-hover` / `--brand-foreground`                   | `primary` / mix(white, step, brand) / `background`                      |
|            | `weekend.background`                                                                           | `--weekend`                                                          | `ghost_element.hover`                                                   |
| Status     | `success`, `warning`                                                                           | `--success`, `--warning`                                             | baseline                                                                |
|            | `error` / `error.hover` / `error.text`                                                         | `--destructive` / `--destructive-hover` / `--destructive-foreground` | baseline / mix(white, step, error) / white                              |
| Events     | `event.color`                                                                                  | `--event-color`                                                      | unset: per-calendar/per-event colour                                    |
|            | `event.background` / `event.text`                                                              | `--event-background` / `--event-foreground`                          | unset: derived tint (§4.6)                                              |
| Scrollbar  | `scrollbar.thumb.background`, `scrollbar.thumb.hover_background`, `scrollbar.track.background` | WebKit pseudo-elements in themes                                     | from `border` / `border.input` / transparent                            |

Check `src/global.css` and `src/themes/README.md` for any variable missing from this table (e.g. `--lane-height`, `--calendar-event-text-*`, `--shadow-*`) and either add a token or make it an internal constant; record the choice in `crates/rencal-theme/AGENTS.md`.

### 4.4 Metric and typography tokens

| New token                                                                                               | Old variable                                                                                   | Notes                                                                                            |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `radius` (px)                                                                                           | `--radius`                                                                                     | Steps multiply it like today (sm ×0.6 … 4xl ×2.6); `radius.circle` = pill unless `radius` is 0.  |
| `control.height` (+ derived `.xs/.sm/.lg`)                                                              | `--control-height*`                                                                            | Minimum supported 24.                                                                            |
| `control.padding_x`, `control.gap`, `control.row_gap`, `control.leading_size`, `control.trailing_inset` | `--control-*`                                                                                  |                                                                                                  |
| `layout.padding`, `nav.padding_x`, `month.padding_x`, `event.padding_x`                                 | `--layout-padding`, `--nav-padding-inline`, `--month-padding-inline`, `--event-padding-inline` |                                                                                                  |
| `scrollbar.width`                                                                                       | `--scrollbar-width`                                                                            |                                                                                                  |
| `font.body`, `font.heading`, `font.button`, `font.numerical`, `font.mono` (family names)                | `--font-*`                                                                                     | Fallback chains become a list: `["Pixelated MS Sans Serif", "Arial"]`.                           |
| `text.scale.<2xs…2xl>.size`, `.line_height` (px)                                                        | `--text-<step>`, `--text-<step>--line-height`                                                  | Month lane height derives from `text.scale.xs.line_height + 4`.                                  |
| `typography.<heading\|button\|numerical>.{size,line_height,weight,transform}`                           | `--text-<role>*`                                                                               | `transform`: `none \| uppercase`. GPUI has no text-transform; apply it when building the string. |

`letter_spacing` is dropped unless the pinned GPUI snapshot supports it (upstream `TextStyle` had no letter spacing when this plan was written).

### 4.5 Style tokens (non-colour, per slot)

These replace the `data-slot` selector escape hatch with an enumerated, typed set. Slots (initial list, derived from what `classic.css`, `rencal-theme-windows98` and `rencal-theme-skeuomorphic` target today):

`button`, `button.primary`, `control` (inputs, selects), `popover`, `dialog`, `dialog.title_bar`, `toast`, `tabs.list`, `tabs.tab`, `toolbar.main`, `toolbar.sidebar`, `event.timed`, `event.all_day`, `month.day`, `minical.day`, `agenda.row`, `scrollbar`, `week_grid`.

Properties per slot, with optional state segment `<slot>[.<state>].<property>` where state ∈ `hover`, `active`, `selected`, `open`, `today`, `disabled`:

| Property       | Type                                                                                  | GPUI mapping                                                                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fill`         | colour, or `{ "gradient": { "angle": deg, "from": colour, "to": colour } }`           | `bg(linear_gradient(..))` (2 stops)                                                                                                                                                                                                                                            |
| `text`         | colour                                                                                | `text_color`                                                                                                                                                                                                                                                                   |
| `border`       | colour                                                                                | `border_color`                                                                                                                                                                                                                                                                 |
| `border_width` | px                                                                                    | `border_*`                                                                                                                                                                                                                                                                     |
| `border_style` | `solid \| bevel_raised \| bevel_sunken \| bevel_raised_double \| bevel_sunken_double` | `solid` → GPUI border. Bevels are painted by a `Bevel` wrapper element: per-edge quads using `bevel.light`, `bevel.dark` (single) plus `bevel.highlight`, `bevel.shadow` (double, Windows 98). GPUI borders have one colour for all sides, so bevels cannot use plain borders. |
| `shadow`       | list of `{ x, y, blur, spread, color, inset }`                                        | `BoxShadow` (verify `inset` exists in the pinned snapshot; if not, render inset shadows as bevel-like edge quads or drop them)                                                                                                                                                 |
| `radius`       | px                                                                                    | overrides `radius` for the slot                                                                                                                                                                                                                                                |
| `text_shadow`  | `{ x, y, color }`                                                                     | Not supported by GPUI. Optional, last: draw the label twice (offset copy underneath). Only for short labels (buttons, toolbars, headings).                                                                                                                                     |
| `gap`          | px                                                                                    | for container slots (`tabs.list`)                                                                                                                                                                                                                                              |

Global bevel colours: `bevel.light`, `bevel.dark`, `bevel.highlight`, `bevel.shadow` (defaults derive from `background` mixed with white/black).

Every slot property defaults to the colour/metric tokens the component uses today, so a theme that sets no style tokens looks exactly like the current app. Components read slot styles through one helper (e.g. `cx.ren_theme().slot(Slot::Button, State::Hover)`) — never ad-hoc token lookups — so adding a slot is one enum variant + one call site.

`--week-grid-background` (currently a CSS background image) becomes `week_grid.fill` plus `week_grid.hour_line` / `week_grid.half_hour_line` colours.

### 4.6 Event colours

Event text is derived from each event's accent colour: on dark themes a chroma-boosted accent mixed into `text`; on light themes the accent with lightness capped. Port the exact formula from the current CSS (search `--calendar-event-text-*` in `src/global.css` and the event style helpers in `src/lib/event-styles.ts` / `src/lib/color-utils.ts`) into `rencal-theme` as `event_colors(accent, &ResolvedTheme) -> EventColors { bar, fill, text, … }`, with fixture tests. `event.color` / `event.background` / `event.text` override as today (see `electric-blue` theme).

### 4.7 Sources, selection and live reload

- Built-ins: `crates/rencal-theme/themes/*.json`, embedded with `include_str!`. Convert the current `src/themes/*.css` with the legacy converter; hand-fix `classic` (its `tabs-list` rule becomes `tabs.list.gap` + `tabs.list.shadow: []`). `contract-debug` stays as a dev-only theme not listed in the picker.
- User themes: `~/.config/rencal/themes/*.json` (watched; edits apply live). `.css` files there are ignored with a diagnostic pointing at the converter.
- Plugin themes: JSON files referenced by the plugin manifest (§4.9).
- Omarchy: port the palette normalisation in `src-tauri/src/omarchy.rs` (already Rust) and the colour mapping in `src/hooks/useOmarchyTheme.ts` + `src/themes/omarchy.css` into an `omarchy_theme(OmarchyColors) -> ThemeContent` that sets primitives only and lets derivation do the rest.
- Selection logic is unchanged: `[theme]` in `config.toml` with `mode` (single/system) and slots `single`, `light`, `dark` (`rencal-config::ThemeConfig`, logic in `src/themes/theme-settings.ts`). System mode follows `window.appearance()` / `cx.observe_window_appearance`. On Omarchy, System mode shows the `omarchy` theme (forced theme) as today. "Toggle theme" (`mod+shift+t`) cycles the active slot.

### 4.8 Bridging to gpui-kit

renCal owns its registry; do **not** use gpui-kit's `ThemeRegistry` or its theme JSON format. After every resolve, write the resolved tokens into gpui-kit's `Theme` global so stock components match, then refresh windows. Mapping (gpui-kit key ← renCal token):

| gpui-kit                                                                        | renCal                                                                             |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `background`, `foreground`                                                      | `background`, `text`                                                               |
| `border`, `input.border`, `ring`                                                | `border`, `border.input`, `border.focused`                                         |
| `primary.background/.hover.background/.foreground`                              | `primary`, `primary.hover`, `primary.text`                                         |
| `secondary.*`                                                                   | `element.background`, `element.hover`, `element.text`                              |
| `accent.background/.foreground`                                                 | `element.highlight`, `element.highlight.text`                                      |
| `muted.background/.foreground`                                                  | `element.muted`, `text.muted`                                                      |
| `popover.background/.foreground`                                                | `elevated_surface.background`, `elevated_surface.text`                             |
| `danger.*`, `success.*`, `warning.*`                                            | `error.*`, `success`, `warning`                                                    |
| `sidebar.*`                                                                     | `sidebar.background`, `text`, `border`, `element.selected`                         |
| `list.active.background`, `list.hover.background`                               | `element.selected`, `ghost_element.hover`                                          |
| `tab.*`, `tab_bar.*`                                                            | tabs slot styles                                                                   |
| `scrollbar.*`                                                                   | `scrollbar.*`                                                                      |
| `selection.background`, `caret`                                                 | `primary` at 30% alpha, `text`                                                     |
| `overlay`, `title_bar.background`                                               | `overlay`, `background`                                                            |
| `font.family`, `font.size`, `mono_font.family`, `radius`, `radius.lg`, `shadow` | `font.body`, `text.scale.base.size`, `font.mono`, `radius`, `radius × 1.4`, `true` |

Where a gpui-kit component can't express a slot style (bevels, gradients, role typography), wrap it or build the component on `gpui_kit::base` instead. Expect to do this for buttons, tabs and inputs.

### 4.9 Plugin contract v2

In `src-tauri/plugin-contract/src/lib.rs`:

- `ThemeContribution { id, name, css, appearance }` → `ThemeContribution { id, file }` where `file` is a JSON theme family; name and appearance come from the file. Validate with the `rencal-theme` parser at install and index time.
- `FontContribution.file` must end in `.ttf` or `.otf`.
- Bump the plugin contract version and require `min_rencal_version` ≥ the first GPUI release. The indexer (`plugin-indexer`) rejects v1 theme plugins for the new catalogue. Preview PNGs are author-supplied and unaffected.
- Update the four in-house theme plugins: `~/dev/ren/rencal-theme-{dracula,gruvbox,windows98,skeuomorphic}` (windows98 and skeuomorphic need the style tokens; windows98 also needs its WOFF2 fonts as TTF).

### 4.10 Website theme builder and docs

- Rework `website/src/pages/theme-builder.astro` (+ `website/src/styles/theme-builder.css`) into a Zed-style token editor: tabs per group (Primitives, Text, Surfaces, Border, Element, Accents, Status, Events, Metrics, Typography, Styles), each token showing its derived value until overridden, search, undo/redo, import (v2 JSON **and** legacy CSS via the converter), export v2 JSON.
- The resolver runs in the browser from `rencal-theme` compiled to wasm (`wasm-bindgen`, feature `wasm`). The live preview (`website/src/components/app-window/`) stays an HTML mock driven by CSS variables generated from the resolved tokens; style tokens map to CSS (`box-shadow`, gradients, per-side border colours for bevels). Note that it is an approximation of the native app.
- The legacy CSS converter lives only in `rencal-theme` (feature `legacy-css`) and the website; the app never reads CSS.
- Rewrite `website/src/content/docs/docs/themes.md`, `.../plugins/themes.md`, `.../plugins/create.md`, `developers.md`, `skills/rencal/references/themes.md` (installed by `skill_install.rs`), and replace `src/themes/README.md` with `crates/rencal-theme/README.md`.

## 5. Porting map (TS → Rust)

| Source                                                                                                                                  | Destination                                                         | Approach                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/event-time/*`, `lib/cal-events.ts`, `lib/cal-events-range.ts`                                                                      | `rencal-time`                                                       | Use `chrono` + `chrono-tz` (caldir-core's `EventTime` is chrono-based: `Date`, `DateTimeUtc`, `DateTimeFloating`, `DateTimeZoned { datetime, tzid }`). Reuse caldir-core's enum as the model; add projection helpers. Reproduce Temporal's `"compatible"` disambiguation (gap → later, overlap → earlier) in one helper. `EventDateInfo` fields as in `types.ts`. |
| `event-time/display.ts` (`Intl.DateTimeFormat("en-GB")`)                                                                                | `rencal-time::display`                                              | Hand-written formatters matching current output strings (fixtures). English only.                                                                                                                                                                                                                                                                                 |
| `event-time/timezones.ts`, `TimeZoneSelect.tsx` labels                                                                                  | `rencal-time::tz`                                                   | `chrono_tz::TZ_VARIANTS`; `timeZoneCity`, `timeZoneOffsetLabel` at the event's date. Viewer tz from `iana-time-zone` + the existing tz watcher.                                                                                                                                                                                                                   |
| `hooks/cal-events/useDayRangeLayout.ts`, `all-day-lanes.ts`, `useMonthEventLayout.ts`, `month-view/lane-geometry.ts`, `useMonthGrid.ts` | `rencal-layout`                                                     | Pure functions over `(events, range) → placements`.                                                                                                                                                                                                                                                                                                               |
| `lib/event-drag.ts`, `lib/drag-to-create.ts`                                                                                            | `rencal-layout::drag`                                               | Pure drop/selection math; see `docs/drag-to-*.md`.                                                                                                                                                                                                                                                                                                                |
| `lib/magic-parser.ts` (chrono-node)                                                                                                     | `rencal-text::magic`                                                | No Rust equivalent of chrono-node. Implement the grammar the app actually supports, driven by a fixture corpus captured from the TS parser (Phase 0). Keep `MagicSegments` highlighting (token spans).                                                                                                                                                            |
| `lib/rrule-utils.ts` (rrule.js), `RepeatSelect.tsx`                                                                                     | `rencal-text::recurrence`                                           | Prefer caldir-core's recurrence types; use the `rrule` crate only if caldir-core lacks a needed piece. Expansion already happens in Rust (`caldir_core::expand_in_range`).                                                                                                                                                                                        |
| `lib/conference.ts`, `lib/contact-suggestions.ts`, `lib/event-url.ts`, `lib/calendar-groups.ts`, `lib/search-results.ts`                | `rencal-text` / `rencal-app`                                        | Straight ports with fixtures.                                                                                                                                                                                                                                                                                                                                     |
| `lib/shortcuts.ts`, `lib/palette-commands.ts`                                                                                           | `rencal-app::keymap`, `::commands`                                  | §3.5                                                                                                                                                                                                                                                                                                                                                              |
| `components/ui/*` (shadcn/Radix)                                                                                                        | gpui-kit components wrapped in `rencal-app::ui`                     | One wrapper per primitive applying slot styles (§4.5).                                                                                                                                                                                                                                                                                                            |
| `react-day-picker` (`ui/calendar.tsx`, `sidebar/minical`)                                                                               | gpui-kit `Calendar`/`DatePicker` for pickers; custom `Minical` view | Minical needs event dots, selection states and the fly-animation target cell bounds.                                                                                                                                                                                                                                                                              |
| `cmdk` (`CommandPalette`, `SearchPalette`)                                                                                              | gpui-kit `Command`                                                  |                                                                                                                                                                                                                                                                                                                                                                   |
| `sonner`                                                                                                                                | gpui-kit `Notification`                                             | Needs action buttons (undo).                                                                                                                                                                                                                                                                                                                                      |
| `react-textarea-autosize`                                                                                                               | gpui-kit `Textarea` (auto-grow)                                     |                                                                                                                                                                                                                                                                                                                                                                   |
| `@tanstack/react-virtual`                                                                                                               | `InfiniteAxis` (§6.1) / gpui `list` for the agenda                  |                                                                                                                                                                                                                                                                                                                                                                   |
| `react-hotkeys-hook`                                                                                                                    | GPUI actions + key contexts                                         |                                                                                                                                                                                                                                                                                                                                                                   |
| `zod` (localStorage/settings validation)                                                                                                | serde with defaults                                                 |                                                                                                                                                                                                                                                                                                                                                                   |
| `src/icons/*` (43 SVG components)                                                                                                       | SVG assets in `crates/rencal-app/assets/icons/`                     | Monochrome icons via `svg()` (tinted). Multi-colour ones (e.g. `google-meet.tsx`, provider icons) via `img()` (resvg rasterisation); check filter/mask rendering. Update the `add-icon` skill.                                                                                                                                                                    |
| `src/fonts/GeistMono-Regular.ttf`                                                                                                       | embedded asset, registered with the text system at startup          |                                                                                                                                                                                                                                                                                                                                                                   |

## 6. Hard features: required approach

### 6.1 Infinite month and week scrolling (`docs/scroll-behaviour.md`)

Build one `InfiniteAxis` primitive used by both views:

- State: `position: f64` in items from a fixed origin (month view: weeks since 1970-01-05 aligned to first-day-of-week; week view: days since 1970-01-01), `item_size: Pixels` (month: square cells, so row height = column width; week: column width), viewport size.
- Render only the visible items (+ overscan) absolutely positioned inside a clipped container. There is no "prepend": every index exists. Resizing changes `item_size` while `position` stays fixed, so the viewport never jumps.
- Input: scroll-wheel/trackpad deltas converted to items; smooth programmatic scroll (`scroll_to(index, animate)`) driven by a per-frame animation (`window.request_animation_frame` / `cx.on_next_frame`), honouring reduced motion.
- Snapping: port `weekSnapSession.ts` + `weekSnapFling.ts` (fling projection lands ahead in the direction of motion; other scrolls settle to the nearest week after 250 ms idle). Snapping is off during initial positioning, drags, drag-to-create and reduced motion. GPUI has no scroll-end event: detect idle with a timer reset on each wheel event. One implementation for all platforms (the macOS CSS-snap path goes away).
- Visible range → `EventStore::ensure_loaded(range)`; loading never blocks scrolling.
- Active date vs scroll position stay independent, exactly as specced, including jump navigation and the "t brings today back into view" rule.
- The agenda (variable-height day sections) uses GPUI `list()` + `ListState` over the same fixed-origin day index space; port `usePreserveActiveDateOnRegroup`, `useInitialScrollToActiveDate`, `useGhostSection`, keyboard nav.

### 6.2 Drag to reschedule and drag to create (`docs/drag-to-*.md`)

- Don't use GPUI's `on_drag`/`on_drop` (typed DnD between elements) for the time grid; it fits poorly with continuous snapping. Run a pointer session: `on_mouse_down` on an event block or an empty cell starts a `DragSession`; the grid view handles `on_mouse_move` / `on_mouse_up` window-wide while the session is active.
- Hit-testing: record each day column's / month cell's bounds during prepaint (e.g. a `canvas` or `on_children_prepainted`), then map pointer position → (day, minutes) with `rencal-layout::drag`. Replaces `elementFromPoint`.
- Edge auto-scroll: while dragging near an edge, advance `InfiniteAxis` / the vertical time scroll per frame.
- Drag overlay (`EventDragOverlay.tsx`) renders in a `deferred()` layer. Drop → `EventCommands` (recurrence scope dialog when needed) with optimistic update and rollback.

### 6.3 Popovers anchored to events

`PopoverNewEvent` / `PopoverEditEvent` anchor to an event block or draft (`lib/event-anchor.ts`, `lib/draft-anchor.ts`), and can open from the keyboard. Keep a per-frame map `EventKey → Bounds` filled during prepaint by the visible event blocks; open the popover with `anchored()` + `deferred()` at those bounds, fall back to a sheet on narrow windows (`SheetInfo`, `fast-sheet.tsx`). Port the tab trap (`useEventPopoverTabTrap.ts`) as a focus scope.

### 6.4 Fly animation (`sidebar/header/FlyAnimation.tsx`)

Today it clones the compose card's DOM node and animates it to the minical day cell (650 ms, cubic-bezier, translate + scale). In GPUI: capture the compose card bounds and the target minical cell bounds during prepaint, render a second instance of the card component in a `deferred()` overlay, and animate position/scale with `with_animation` and an equivalent cubic-bezier easing. Respect reduced motion. Keep the name "fly animation".

### 6.5 Text input

Use gpui-kit `Input`/`Textarea`/`Combobox`/`NumberInput`/`TimeField` (IME comes from GPUI: Wayland text-input-v3, X11 XIM; test with fcitx5). Port `TimeInput`, `DateTimeSelect`, `TimeZoneSelect` (searchable), `ReminderSelect`, `RepeatSelect`, `AttendeesDisplay` (contact autocomplete), `UrlInput`, `LocationInput`, `NotesInput`, `password-input`, `ComposeEventInput` + `MagicSegments` (inline highlighted spans: render the input text with highlight runs, or overlay highlights at glyph positions from the input's layout).

### 6.6 Smaller items

- Current-time indicator, `useNow`/`useToday`: one `Clock` global ticking on minute boundaries and on tz change.
- Context menus (`EventContextMenu`, `AllDayContextMenu`, `ScheduledDayContextMenu`, month `Cell`): gpui-kit `Menu` / context menu.
- Tooltips with shortcut hints: gpui-kit `Tooltip` fed from the keymap table.
- Links: `cx.open_url` (replaces `@tauri-apps/plugin-opener`).
- Theme preview tiles in Settings → Themes: render the real components with a scoped resolved theme (native rendering makes previews exact).
- Plugin preview PNGs: `img()` from `https://rencal.org/plugin-previews/*` (current CSP allowlist becomes a URL check).
- Debug mode: `RENCAL_DEBUG` env var replaces `VITE_RENCAL_DEBUG`; `just debug` keeps working; logs via `log`.

## 7. Platform integration

| Today                                                                                                     | GPUI app                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tauri-plugin-opener`                                                                                     | `cx.open_url`                                                                                                                                                                                                           |
| `tauri-plugin-notification`, `macos_notifications.rs`, `linux_reminders.rs`, `notifierd`, `reminder-core` | Keep `reminder-core` + `notifierd` + the macOS UNUserNotificationCenter code as is; drop the Tauri plugin. Read `docs/notifications.md`.                                                                                |
| `tauri-plugin-dialog` (xdg portal)                                                                        | `cx.prompt_for_paths` / `prompt_for_new_path` (portal on Linux), gpui-kit `Dialog` for ask/confirm                                                                                                                      |
| `tauri-plugin-deep-link` (`rencal://`)                                                                    | Linux: argv + the existing `single_instance.rs` forwarding; `.desktop` `MimeType=x-scheme-handler/rencal` (`src-tauri/linux/rencal.desktop`). macOS: `cx.on_open_urls`. Keep `deep_links.rs` parsing.                   |
| `tauri-plugin-single-instance` (macOS/Windows)                                                            | macOS: the OS enforces one instance per bundle; still forward `open_urls`. Linux: existing `single_instance.rs`.                                                                                                        |
| `tauri-plugin-updater`, `tauri-plugin-process`, `lib/updater.ts`, `UpdateChecker.tsx`                     | `cargo-packager-updater` (D7), same `latest.json` + minisign key; restart via re-exec. AUR builds skip the updater as today.                                                                                            |
| `tauri-plugin-log`                                                                                        | `env_logger`/`simplelog` to the same log file location (bug-report instructions in `docs/notifications.md` → "Logs for bug reports").                                                                                   |
| Frameless window (`decorations: false`) with native fallback                                              | `WindowOptions { window_decorations: Some(WindowDecorations::Client), titlebar: Some(TitlebarOptions { appears_transparent: true, .. }) }` + gpui-kit `TitleBar`; server-side fallback when the compositor requests it. |
| Settings webview window (`create-webview-window`)                                                         | second GPUI window via `cx.open_window`, focused if already open                                                                                                                                                        |
| `menu.rs` (macOS)                                                                                         | `cx.set_menus` + actions                                                                                                                                                                                                |
| OAuth (`oauth/server.rs`, `connect_provider.rs`)                                                          | unchanged; open the browser with `cx.open_url`                                                                                                                                                                          |
| `nvidia_workaround.rs`                                                                                    | delete (WebKitGTK-specific). Test GPUI's renderer on NVIDIA separately.                                                                                                                                                 |
| Tauri bundler (`tauri.conf.json`, `tauri.*.conf.json`, `Info.plist`, `icons/`)                            | `cargo-packager` config: AppImage, macOS `.app`/`.dmg`, `.desktop` + icons; port `Info.plist` keys (URL scheme, notification usage).                                                                                    |
| CI: `.github/workflows/{ci,release,publish-aur,plugins,website}.yml`                                      | `ci.yml`: cargo test/clippy for the workspace, no pnpm for the app. `release.yml`: cargo-packager builds + signing + `latest.json`. `publish-aur.yml`: new binary name/paths. `plugins.yml`: indexer with contract v2.  |

## 8. Phases

Each phase ends with `just check` and `just test` green, and the Tauri app still working until Phase 8. Stop for the user at each commit point (the user makes all commits).

**Phase 0 — Foundations (no GPUI yet)**

1. Move the workspace root to `/Cargo.toml`; update `justfile`, CI and `--manifest-path` uses.
2. Extract `rencal-core` from `src-tauri/src` (§3.1), with a `specta` feature for the Tauri app. The Tauri app becomes a thin taurpc/Tauri shell over it.
3. Golden fixtures: add a script (vitest-based, under `scripts/fixtures/`) that runs the TS implementations over input corpora and writes JSON to `crates/*/tests/fixtures/`: event-time projections/display/edits (cover DST gaps/overlaps, floating, UTC, zoned, all-day, iCal exclusive ends), week overlap layout, all-day lanes, month lanes, drag/drop math, drag-to-create math, magic parser (≥200 phrases incl. the existing tests), rrule utils, conference detection, contact suggestions, shortcuts table.
4. Theme fixtures: dump the computed value of every documented token for every built-in theme (light and dark, plus Omarchy with a sample palette) from the running webview (`getComputedStyle` on a `[data-theme]` node) into `crates/rencal-theme/tests/fixtures/`.
5. `rencal-theme`: types, schemars schema, resolver + derivation, legacy CSS converter, built-ins converted to JSON, parity test against step 4.

Exit: Tauri app unchanged for users; `rencal-theme` resolves all built-ins to fixture parity.

**Phase 1 — App skeleton**

`rencal-app` with gpui-kit pinned; tokio bridge; `Settings`, `ThemeStore` (+ gpui-kit bridge, live reload of user themes, Omarchy, system appearance); `UiState`; watchers wired to entities; main window with CSD title bar, sidebar/main split, collapse; settings window shell; single instance + deep-link intake; logging; `RENCAL_DEBUG`; `just app` / `just debug` recipes.

Exit: app opens on Omarchy and macOS with the configured theme; editing `config.toml` or a theme JSON updates the window live.

Implementation notes (2026-10-07):

- gpui-kit pinned at `=0.7.1` (GPUI `gpui-pre-*` 0.3.8). It ships no `gpui_tokio`; `rencal-app/src/runtime.rs` is the `Tokio` global from D6.
- Until cutover the GPUI binary is `rencal-app` (the Tauri package owns `rencal`) and its single-instance socket is `rencal-gpui` (`single_instance::try_acquire_or_signal` now takes the name). Rename both in Phase 8.
- `just app [flags]` runs it; flags set `RENCAL_DEBUG`. `just debug` keeps running the Tauri app until cutover.
- User themes are `~/.config/rencal/themes/*.json` via `rencal_core::user_themes` (`user:<file stem>`, or `user:<variant name>` for multi-variant families). CSS files there get a diagnostic. Plugin themes are not loaded by the GPUI app until contract v2 (Phase 7).
- External caldir changes bump a `CaldirRevision` global (calendars/events/providers) that Phase 3's `EventStore` observes.
- Linux decorations: client-side (frameless) on tiling compositors, server-side on the stacking desktops `rencal_core::platform::needs_native_decorations` lists, as the Tauri app did. Closing the main window quits, except on macOS (dock reopen).
- Verified headless on Linux (sway + lavapipe): window renders with the configured theme; editing a user theme JSON and `config.toml` updates it live. Not yet verified on a real Omarchy session, on macOS (traffic-light position (16, 30) copied from `tauri.macos.conf.json`), or with fcitx5/AccessKit.

**Phase 2 — Domain crates**

`rencal-time`, `rencal-layout`, `rencal-text` ported with fixture parity; port the related vitest suites to Rust tests.

Exit: all fixture tests pass.

Implementation notes (2026-10-07):

- Every case in every `rencal-time`, `rencal-layout` and `rencal-text` fixture file passes, with no skips. The related vitest suites are ported as Rust tests in each crate's `tests/`. The app fixtures (`shortcuts`, `palette_commands`) belong to Phase 3's keymap.
- `rencal-time` has its own `EventTime` (`Zoned` holds a `DateTime<Tz>`) instead of caldir-core's wallclock + tzid string, because the UI needs Temporal semantics. Conversion to and from caldir-core types goes in `rencal-core`. The viewer's zone and "today" are arguments; `CalendarEvent::date_info` is not serialized and must be refreshed for the viewer (`with_viewer`/`refresh_date_info`). The event model types (`CalendarEvent`, `Calendar`, …) live in `rencal_time::event` and mirror rencal-core's RPC types until cutover.
- `rencal-layout` refers to events by their index in the input slice and builds no colours (the app resolves them from `calendar_slug`). Placements keep whole minutes; columns are 0-based with exclusive ends; all-day bar geometry returns a pixel `Rect` from theme metrics. `week_snap` has the pure fling/snap maths and the landing curve (`SnapFling`); the session (wheel idle timer, frame loop) is Phase 3's `InfiniteAxis`. Open for Phase 3: whether the WebKitGTK takeover constants (`TAKEOVER_*`, `SCROLL_CAPTURE_MS`) still apply to GPUI scroll input (answered in the Phase 3 notes: they don't).
- `rencal-text` expands recurrences with the `rrule` crate (caldir-core's expander) in rrule.js's "fake UTC" wallclock convention, and prints rrule.js-identical `toString`/`toText`. `createRRuleWithDtstart`'s bug is kept because the fixtures pin it: nth weekdays (`BYDAY=2TU`), negative `BYMONTHDAY` and `BYSETPOS`/`BYYEARDAY`/`BYWEEKNO` are dropped when search results move a series to its nearest occurrence. Rules the `rrule` crate rejects (e.g. weekly + `BYMONTHDAY`) leave the master unchanged.
- The magic parser (`rencal_text::magic`) is a faithful port of the chrono-node 2.9 subset in use (parsers and refiners in chrono's order), checked against chrono-node on ~830 extra phrases beyond the corpus. chrono quirks are reproduced, including dropping an overnight time range typed on a month's last day. Not ported: zone suffixes (`3pm PST`).

**Phase 3 — Read-only calendar**

`EventStore`, `Navigation`, `Clock`; `InfiniteAxis`; month view (lanes, today/weekend, week numbers, snap + fling), week view (time grid, all-day lanes, current-time indicator, horizontal infinite strip), board view; minical; agenda (infinite, keyboard nav); main header; actions + keymap; command palette, search palette, shortcuts overlay; invites badge; sync status.

Exit: browsing parity with the Tauri app against `docs/scroll-behaviour.md`, side by side.

Implementation notes (2026-10-07):

- State: `Backend` (shared `AppState`, blocking reads on the runtime), `Clock` (minute ticks, viewer zone from `Settings::system_tz`), `Navigation` (active date; `navigate_to` bumps `version` so views recheck visibility even for the same date), `EventStore` (calendars, active-group visibility, invites, open/selected event) and `SyncState`. `EventStore` keeps `CalEventsContext`'s serialized worker (desired range only grows, missing slices fetched and merged, stale loads redone); its first request also covers `start_range_for_date(active date)`, so the agenda and minical get their months whichever view asks first. Events convert from rencal-core's RPC types with serde (rencal-time mirrors them); events in unknown zones are skipped.
- `InfiniteAxis` (`views/axis.rs`): month items are weeks from 1970-01-05 (Monday-first) or 1970-01-04 (Sunday-first), week items are epoch days. Views size themselves from the previous frame's bounds (`views::measure`, a prepaint `canvas`). Month jumps scroll instantly (as TanStack's `scrollToIndex` did); week jumps animate (350 ms ease-out, cut to two viewports for long jumps).
- Week snapping: GPUI has no kinetic scrolling on Linux (Wayland's axis-stop is ignored) and reports macOS momentum events as plain `Moved`, so there is nothing to take over and the `TAKEOVER_*` constants were dropped from `rencal-layout`. `WeekSnap` flings a precise (touchpad) gesture that stops at ≥ 300 px/s to the boundary ahead; the lift is a 50 ms input gap on Linux and `TouchPhase::Ended` on macOS (the OS momentum after it is swallowed). Other scrolls settle after 250 ms; snapping is off while a jump settles and with reduced motion. `FLING_MIN_VELOCITY` and `LIFT_GAP` need tuning on a physical trackpad (Omarchy and macOS).
- Agenda: GPUI `list` over day sections keyed by epoch day (only days with events, plus the ghost), not over every day: empty days aren't sections, and walking thousands of empty items would stall layout. Rebuilds keep the day at the top. The sticky day header is an overlay pushed up by the next section's header. Jumps scroll the agenda instantly (the TS smooth scroll is not ported).
- Keymap: one table (`keymap.rs`, fixture-tested) feeds bindings, the overlay, the palette and tooltips. Single-character and calendar-moving bindings live in the `CalendarView` context; settings, toggle theme, toggle sidebar and the palette are global. `Escape`/`Enter` drive the agenda selection. `allowWhileEventOpen` is recorded but enforced only once events open in a popover (Phase 4). Compose, add-event and duplicate are bound but have no handler until Phase 4.
- Event deep links (`rencal://` from reminders) are drained and open the event (`search::jump_to_event`, which waits for a far date's events to load).
- Deferred: RSVP in the invitations popover and context menus (Phase 4), the mass-delete dialog (Phase 5; the pending list is kept and the sync lock released), the offline sync icon (no `navigator.onLine` equivalent), the blinking colon of the current-time label, and the hover brightness on filled event blocks.
- GPUI quirk: a quad no taller than its border paints nothing, so hairlines (the dashed current-time line) are background quads.
- Verified headless on Linux (sway + lavapipe, `wtype` for keys): all three views, sidebar, narrow layout, command palette, go-to-date, search and the shortcuts sheet. UI tests cover month/week positioning and the jump rules, week-snap settling, agenda `Tab`/`Enter`/`Escape`, the palette, `t`, jumping to a recurring search result, and loading through a real `AppState` (ranges, groups, reload on caldir change). Not yet verified side by side with the Tauri app, on a real Omarchy session, on macOS, or with a physical trackpad.

**Phase 4 — Editing**

Event popovers/sheets and every input (§6.5); compose + magic input + fly animation; save with optimistic update/rollback; delete, duplicate, recurrence-scope dialogs; undo toasts; context menus; drag to reschedule; drag to create; RSVP; conference links.

Exit: every editing flow in the Tauri app works the same; drag specs pass.

Implementation notes (2026-10-07):

- Layout: `rencal-app/src/editing/` (`commands`, `dialogs`, `draft`, `form` + `fields/`, `popover`, `compose`, `drag`, `context_menu`), `ui/anchors.rs`, `views/interact.rs`; writes and their RPC conversion in `backend.rs` (`EventFields`). `crates/rencal-app/AGENTS.md` has the map and the rules.
- The draft is a `CalendarEvent` with id `__draft` (reminders included, empty `calendar_slug` = no writable calendar), so the form and the views treat it like any event. `ViewEvents` appends the draft, the drag preview and the month create selection to what a view lays out, with an `EventRole` each (`useEventsWithDraft`/`useEventsWithDrag`).
- Geometry the DOM used to answer (`elementsFromPoint`, `getBoundingClientRect`, `data-drop-day`, `setEventAnchor`) comes from `ui::anchors`: event blocks, drop targets, scroll containers and named anchors record their visible bounds each frame. Popovers anchor at a bounds snapshot like before; drags hit-test drop regions. A background ignores a press over a recorded event block (the old `target === currentTarget`).
- Keys: calendar bindings are `CalendarView && !Input` (inputs now live inside the main window: popover, compose) and `&& !event_open` unless `allowWhileEventOpen` (the old `lockBackground`); locked global ones are `!event_open`. `Tab` from the calendar enters the popover at the title; inside, gpui-kit's focus trap cycles. `Delete`/`Backspace` delete the open event (no field focused) or the agenda's selected row.
- `ClickGuard` replaces `suppressNextClick`: the release after a drag and the press that closes the popover swallow that click for navigating handlers. Each press starts a new generation, so it can't stick.
- Context menus are one renCal-owned menu at the pointer (`editing::context_menu`), not gpui-kit's `context_menu`, which opens every nested trigger (an event inside a month cell). Items show their key hint through the item's action while running their own handler.
- Inputs: gpui-kit's `Combobox` is a searchable select, so time / reminders / attendee suggestions build on `fields::ComboState` (an input with a list: Up/Down, Enter, Escape). Two GPUI details: an input's `Focusable` handle is its frame, not the handle its `InputEvent::Focus` follows, so the combo listens on the frame; `ScrollHandle::scroll_to_item` is dropped on a scroll container's first frame, so the reveal waits one frame. Dates use gpui-kit's `Calendar` in a `Popover`; selects (repeat, calendar) are popovers with lists.
- Fly animation: GPUI can't scale an element tree, so the flying card is a card-shaped box with the title and time that moves to the minical cell, shrinks to its width ratio and fades (650 ms, `cubic-bezier(0.4, 0, 0.2, 1)`); the section holds its height for 950 ms. Reduced motion skips it.
- Deliberate differences: Enter in the compose input applies a pending parse first (the TS created the draft as last parsed, up to 300 ms stale); a month create selection's popover anchors at the cell last under the pointer, not the nearest selection segment; the multi-colour Google Meet icon isn't ported (the video icon stands in); without a writable calendar, create opens the settings window until Phase 5's accounts page. There were no undo toasts in the TS app (only error toasts), so none were added.
- Verified headless on Linux (sway + lavapipe, now with a persistent wlroots virtual pointer for clicks and drags, `wtype` for keys): popover open/edit/save beside the block, week and month drag to reschedule (preview, dimmed source, floating copy, scope dialog, occurrence override on disk), drag to create, compose with magic outlines and the fly animation, context menus, delete dialog, `a`, narrow sheet. UI tests cover popover save, the keyboard lock and `Tab` entry, week drag (no navigation on release), week/month drag to create, compose, the event menu, delete, and the time combo; `backend::write_tests` round-trips create/move/split/delete through caldir. Not verified: macOS, a physical trackpad, IME, edge auto-scroll by hand, and combos clicked in the headless session (GPUI only fires focus listeners in the active window, which headless sway only reports while a virtual keyboard exists; a second virtual keyboard crashes GPUI's Wayland client with a keymap-less `Modifiers` event, an upstream bug).

**Phase 5 — Settings**

General, Calendars (groups, rename, colour via gpui-kit `ColorPicker`, subscriptions, local calendars), Accounts (provider list, credentials form, OAuth connect), Reminders, Themes (slots, previews, diagnostics for broken user/plugin themes), Plugins (catalogue, details, install dialog, deep-link install, sheet); mass-delete confirm on sync.

Implementation notes (2026-10-07):

- Layout: `windows/settings_window/` (one view per page, built fresh when its tab opens, like the old unmounting tabs; `controls`, `groups`, `calendar_dialogs`), `accounts/` (`Providers`, the connect and subscription dialogs), `plugins/` (`Plugins` global, merged list, `PluginDetails`, the deep-link `install_dialog`), `mass_delete.rs`. `crates/rencal-app/AGENTS.md` has the map.
- The connect dialog is shared by Settings › Accounts, the create gate (no writable calendar now opens it instead of the settings window) and the agenda's get-started state (with the local-only option). Browser sign-ins get a URL opener whose URLs the main thread opens with `cx.open_url`. Reconnect starts the flow directly and opens the dialog only for setup / credentials steps, as before.
- Writes: renCal's config through `Settings::update_rencal` (now a no-op on disk without the `Tokio` global, so tests never write), caldir's through new `Settings::set_*` (optimistic; the caldir config watcher confirms). Calendar writes reload `EventStore`'s calendars when they land.
- Calendar colour uses gpui-kit's `ColorPicker` (palette + HSLA, the local-calendar colours featured) in the dialog, replacing the hue slider; saved as `#rrggbb`. The data directory uses `cx.prompt_for_paths` (the portal on Linux).
- Themes: previews are painted natively from each theme's own resolved tokens (a cropped minical + week window, like the old CSS preview). Diagnostics list the user theme files' problems; plugin themes come back with contract v2 (Phase 7).
- Plugins: GPUI has no HTTP client on the desktop, so catalog previews are fetched by `rencal_core::plugins::fetch_preview` (only `https://rencal.org/plugin-previews/<sha256>.png`, the old CSP allowlist) and cached per run; local previews and plugin provider icons are `data:` URLs decoded in `ui::image`. The plugin watcher's reconcile bumps `Plugins::revision`, which refreshes the lists. Install links (`rencal://plugin/install?repo=…`) open a dialog in the main window; links wait in the inbox while an action runs.
- Mass delete: a sync that holds back calendars keeps the sync lock until the main window's dialog is answered (delete / restore / cancel; Escape cancels), as `SyncContext` did. The main window checks on render, so a dialog already open only delays it.
- GPUI details: `open_dialog` focuses the dialog after the view is built, so inputs are focused after opening; a single-line input passes Enter on to the dialog's Confirm (which closes it and drops the view before its `PressEnter` arrives), so dialogs submit from `on_ok`. Fixed a Phase 3 crash: GPUI runs a `ListState` scroll handler while the list is borrowed, and the agenda's read the list, so any wheel scroll over the agenda panicked (the headless harness had never sent wheel events); the handler now defers.
- Not ported / deferred: the About section's update check (Phase 6 updater); the destructive (red) style of "Delete calendar" / group "Delete" menu items (gpui-kit's `PopupMenuItem` has no variant).
- Verified headless on Linux (sway + lavapipe; the virtual pointer now sends wheel events): every page; calendar colour (written to the calendar's config and shown live), group create / toggle (live in the main window), the connect dialog's provider list, credentials step (validation, masked field) and local-only calendar from the get-started state; plugin grid, sheet (preview, scrolling), install and uninstall (toasts, list refresh); the deep-link install dialog through a second launch. UI tests cover the page nav and Escape, calendar toggles, group validation / create / select, the plugin grid and sheet, the mass-delete dialog and the connect dialog's validation; unit tests the plugin list merge / sort / filter / selection, install actions, group edits and provider ordering. Not verified: a real OAuth or CalDAV connect, the reminders combo in the settings window (focus-driven; headless limit), the folder portal, macOS.

**Phase 6 — Platform and distribution**

Notifications, updater, packaging (AppImage, AUR, macOS), URL scheme registration, macOS menu, CI/release workflows, signing.

Exit: a release candidate installs and updates on Omarchy and macOS.

**Phase 7 — Theme ecosystem and website**

Plugin contract v2 + installer + indexer; publish `/schema/themes/v1.json`; theme builder rework (wasm resolver, v2 export, legacy import); docs and skill rewrite; convert the four `rencal-theme-*` plugin repos (style tokens for windows98/skeuomorphic; TTF fonts).

**Phase 8 — Cutover**

Delete `src/`, `index.html`, `vite*.ts`, the app's pnpm deps (website keeps its own), `src-tauri` Tauri shell (`lib.rs`, `routes/`, `events.rs`, `state_bridge.rs`, `capabilities/`, `tauri*.json`, `build.rs`, `examples/gen_types.rs`), `src/rpc`. Move remaining crates from `src-tauri/` into `crates/`. Rewrite `AGENTS.md` (root, plus new per-crate ones), `README.md`, `justfile` (`gen-types`, `typecheck` go away), `.agents/hooks/post-edit.sh`, and the `add-icon`, `performance-analysis`, `local-caldir` skills. Release notes call out the theme format break and the converter.

## 9. Testing strategy

- Pure crates: unit tests + golden fixtures from Phase 0 (the TS implementation is the oracle until cutover; after cutover the fixtures are the spec).
- Theme: fixture parity, cycle detection, schema round-trip, every built-in and in-house plugin theme loads without diagnostics.
- UI: gpui-kit's UI integration tests (`test-support` feature: `#[gpui_kit::test]`, `TestAppContext`, `VisualTestContext`, headless windows, simulated input) for navigation, keyboard shortcuts, popover open/close, drag sessions, and focus trapping. Port the intent of `useEventPopoverTabTrap.test.tsx`, `combo-box.test.tsx`, `select.test.tsx`, `tabs.test.tsx`, `PluginInstallDialog.test.tsx`.
- Manual QA checklist per phase built from the `docs/*.md` specs, run side by side with the Tauri app on Omarchy (Hyprland, NVIDIA and non-NVIDIA) and macOS.

## 10. Risks and open questions

- **GPUI churn.** Pinned `gpui-pre-*` snapshots change API; gpui-kit is 0.7. Budget upgrades; isolate GPUI-specific code in `rencal-app`.
- **Capabilities to verify early (Phase 1 spike):** inset `BoxShadow`, `linear_gradient`, per-frame animation APIs, CSD + resize on Hyprland, IME with fcitx5, font fallback for CJK/emoji in event titles, multi-colour SVG via `img()`, `on_open_urls` on macOS, `prompt_for_paths` via portal, gpui-kit `Notification` with action buttons, `Textarea` auto-grow, AccessKit coverage (screen readers on Linux via AT-SPI).
- **Magic parser parity** is the largest pure-logic risk (chrono-node is a big library). Decide the supported grammar from the fixture corpus; out-of-corpus phrases may behave differently.
- **Theme builder preview** is an HTML approximation of a native app; style tokens (bevels, gradients) can diverge visually. Optional future: compile real views to wasm (gpui-kit supports `wasm32-unknown-unknown`).
- **Third-party CSS themes break.** Mitigation: converter in the theme builder, clear release notes. No runtime shim (by design).
- **Plugin views / generated views** are out of scope; keep the view registry open for a later declarative view spec.
