# renCal Agent Guide

A calendar app crafted for Omarchy.

## Commands

- `just check`: check for errors
- `just gen-types`: generate typescript bindings from rust

## Architecture

This is a Tauri v2 application with a Rust backend and React frontend.

The Rust backend handles caldir operations (reading/writing calendars and events from `~/caldir/`) and OAuth flows.
The TypeScript frontend handles UI state and communicates with the backend via taurpc.

### Backend (Rust)

- `src-tauri/src/lib.rs`: Registers taurpc routers
- `src-tauri/src/oauth/`: Low-level OAuth primitives (localhost callback server, native popup window)
- `src-tauri/src/routes/caldir/`: taurpc API procedures, one file per procedure, including
  `connect_provider` (OAuth flow) and `connect_provider_with_credentials` (credentials flow like
  iCloud). Shared types live in `caldir/types.rs`, conversion helpers in `caldir/helpers.rs`
- `src-tauri/src/notifications.rs`: Background reminder notifications
- TypeScript bindings are auto-generated as `src/rpc/bindings.ts`

### Frontend (React)

- `src/main.tsx` Frontend entry point; renders `@/windows/AppWindow` (or `SettingsWindow`)
- Communicates with Rust backend via taurpc generated bindings
- Always use pnpm for frontend dependencies
- Use tailwind and shadcn for components
- We use tailwind v4 with the config at `src/global.css`
- Use `react-icons` for all icons
- When applying a class conditionally, use the `cn` utility function
- Avoid using margins, instead use paddings and flex-gaps
- Always use absolute imports with the `@/` alias. Only use relative imports when the file is in the same directory (e.g. `./Sibling`). Never use `../` to go up directories.

## Rules

- If implementing a frontend feature, run "just typecheck" in the end to make sure the TypeScript compiled.
- If implementing a feature in Rust (`src-tauri`), run "just check" to make sure the app compiles!
- For event dates and times, work with `EventTime` and the helpers in `@/lib/event-time` — never call `.toISOString()`, `.toLocaleString()`, `parseISO`, or `new Date(string)` on event start/end values. See the **Dates and times** section below for the model.
- _NEVER_ use the `any` type in TypeScript! Always aim to have as precise types as possible. If
  you're using `any`, you're doing something wrong.
- Avoid using `i64`/`u64` in taurpc route types — Specta forbids BigInt exports to TypeScript. Use `i32`/`u32` instead.
- Provider credential field IDs (used in `connect_provider_with_credentials`) are defined by the caldir provider binaries, NOT by renCal. Always check the provider source code for the expected field IDs (e.g., iCloud expects `apple_id` and `app_password`, not `email`/`password`).
- For taurpc types with a fixed set of string values, use a Rust enum with `#[serde(rename = "...")]` variants instead of `String`. Specta generates these as TypeScript string literal unions (e.g., `ResponseStatus = "accepted" | "declined" | ...`). See `ResponseStatus` in `caldir/types.rs` for the pattern.
- To change `activeDate`, prefer `navigateToDate` over the raw `setActiveDate` setter from `useCalendarNavigation`. `navigateToDate` also syncs the sidebar `EventList` scroll position and lazy-loads events for distant dates. Only reach for `setActiveDate` if you specifically need to suppress those side effects.

## Bundled Providers

renCal bundles the Google, iCloud, Outlook, CalDAV, and WebCal caldir provider binaries so they work out of the box. The
`just dev` / `just build` recipes compile them from `../caldir/` into `src-tauri/providers/`. At
startup, `lib.rs::setup_bundled_providers` resolves that directory and stores it in the
`BUNDLED_PROVIDERS_DIR` once-cell. Routes load caldir via the `load_caldir` helper, which calls
`Caldir::with_bundled_providers(dir)` — caldir-core discovers providers from `PATH` first, then
overlays the bundled ones, so bundled providers **override** any conflicting user-installed ones (they're
version-matched to this build) while still allowing extra providers from `PATH`. The providers are
shipped as Tauri bundle resources (configured in `tauri.conf.json`).

## Calendar Data (caldir)

renCal reads calendars and events from the local caldir directory (`~/calendar/`) via the
`caldir-core` Rust crate. The Rust backend exposes caldir operations as taurpc procedures
(`src-tauri/src/routes/caldir/`), and the frontend calls them via `rpc.caldir.*`.

Calendars are listed from caldir and grouped by account in the settings UI. The account identifier
comes from the `{provider}_account` field in each calendar's `.caldir/config.toml` (e.g.,
`google_account`, `icloud_account`). See the caldir repo's agent guide for the account identifier convention.

## Dates and times

Event datetimes carry **wall-clock + IANA timezone** (e.g. `12:00 / Europe/Stockholm`), not a UTC instant — the wall-clock is the source of truth, the instant is derived. This matches RFC 5545 / RFC 8984 and the Google/Outlook APIs, and keeps recurring events DST-correct ("every weekday at 9am" stays 9am wall-clock year-round).

The same model flows through three layers: `EventTime` on disk (`caldir-core`), `RpcEventTime` over taurpc, and `EventTime` on the frontend (`@/lib/event-time`, backed by `Temporal`). The RPC adapter in `src/lib/cal-events.ts` converts at the boundary, so app code only ever touches the frontend `EventTime` and the `CalendarEvent` / `Recurrence` types from `@/lib/cal-events` — never the raw RPC types from `@/rpc/bindings`.

**Rules:**

- Manipulate event times only through the helpers in `@/lib/event-time` (construction, display, arithmetic, edits, predicates) — they operate in the event's own zone and are DST-correct. Read the module before hand-rolling anything.
- Never call `.toISOString()`, `.toLocaleString()`, `parseISO(...)`, or `new Date(eventTimeString)` on an event datetime.
- Don't add an `allDay: boolean` sidecar — the `kind: "date"` variant already encodes it.
- Don't derive UTC instants from wall-clock + tzid yourself; use `instantForOrdering(et)` when you need an ordering projection.

## Infinite scroll rules

Both MonthView and WeekView use infinite scroll to navigate dates, and both update `activeDate` as the user scrolls. Each enforces invariants so that scroll-driven updates don't fight programmatic navigation or jump in the wrong direction.

### MonthView (`src/components/main/month-view/Grid.tsx`)

- Virtualizes by week using tanstack-virtual; the unit visible in the viewport is a week row.
- The dominant month (by visible area) in the viewport drives `activeDate`. When it differs from the active month, `activeDate` is set to the **1st of that month** — but only if the 1st is currently visible in the viewport. If it isn't, skip emission and wait for a later scroll tick.
- **Direction guards** (always enforce):
  - Scrolling up must never set `activeDate` to a date later than the current `activeDate`.
  - Scrolling down must never set `activeDate` to a date earlier than the current `activeDate`.
- After programmatic scrolls (initial mount, anchor scroll, explicit navigation), suppress scroll-driven updates briefly via `ignoreScrollUntil` and reset `prevScrollTopRef` so the next tick re-establishes the direction baseline before emitting.

### WeekView (`src/components/main/week-view/WeekTimeGrid.tsx`)

- Renders days linearly (no virtualization). Days are prepended/appended in 7-day chunks by `useInfiniteDays` when the user scrolls within ~200px of the horizontal edges.
- The leftmost fully-visible column drives `activeDate`. Updates are debounced by `SCROLL_SETTLE_MS` (300ms) so transient positions during a scroll don't fire.
- When days are prepended, correct `scrollLeft` by `added * dayWidth` so the viewport stays anchored on the same content (no visible jump).
- After programmatic scrolls (initial scroll-to-now, smooth nav-into-view), suppress scroll-driven updates via `ignoreScrollUntilRef` (~500ms).

## Agenda keyboard navigation

The sidebar agenda (`src/components/sidebar/agenda/`) is keyboard-navigable so you can move through
events without the mouse. `Tab` focuses the agenda and selects the first event of the active day;
while it's focused, `Tab` moves to the next event, `Shift+Tab` moves to the previous event, `Enter`
opens the selected one, and `Escape` hands control back to normal app focus. Selection keeps the
active day in sync as it moves, scrolling just enough to keep the selected event comfortably in view
under the sticky day header.

The keyboard logic lives in `useAgendaKeyboardNav.ts`, with focus/selection state in
`AgendaFocusContext`.

## Natural Language Event Input

The header input parses natural language into structured event fields using `src/lib/magic-parser.ts` (`parseEventText`; `segmentEventText` locates the matched ranges for highlighting). Parsing is debounced (300ms) in `EventDraftContext.setText` and extracts three things in order:

1. **Recurrence** — "every week", "every saturday", "every weekday", etc. Produces an rrule string. Day names are kept in the text so chrono can resolve the start date.
2. **Time/date** — Powered by chrono-node. Handles "at 3pm", "tomorrow", "next Friday at 10am", etc. The matched text (plus connector words like "at", "on") is stripped from the summary.
3. **Location** — After time extraction, any trailing "at ..." or "in ..." in the summary is treated as a location (e.g. "dinner at Luigi's at 7pm" → location "Luigi's").

## Themes

Themes live in `src/themes/<id>.css` and are scoped by `[data-theme="<id>"]`.
The default (ren) values live in a `:root, [data-theme="ren"]` block in `src/global.css`.

To add a new theme (see `src/themes/README.md` for the canonical walkthrough):

1. Create `src/themes/<id>.css` with a `[data-theme="<id>"] { ... }` block overriding whichever primitives you need.
2. Import it from `src/global.css`.
3. Register it in `src/themes/manifest.ts` (`{ id, name, appearance }`).
4. Add a flash-prevention rule in `index.html` pointing at the theme's background color.

### The "Omarchy" theme

The `omarchy` theme is a special case. On Omarchy machines its primitives are injected at runtime from `~/.config/omarchy/current/theme/colors.toml` by `src/hooks/useOmarchyTheme.ts`, into a managed `<style>` element appended to `<head>`. A Rust file-watcher in `src-tauri/src/omarchy.rs` emits `omarchy-theme-changed` when the OS theme changes so renCal repaints live. `src/themes/omarchy.css` holds a static Tokyo Night palette as a fallback for non-Omarchy users (e.g. the settings preview tile); the dynamic `<style>` wins via source order when present, not specificity, so don't strip the static values.

On first launch with no persisted preference, `useTheme.ts` defaults to `omarchy` if `rpc.omarchy.get_colors()` returns non-null (Omarchy detected on disk), otherwise to `ren` (the default everywhere else — macOS, Windows, non-Omarchy Linux). Subsequent launches use the persisted choice from `~/.config/rencal/config.toml`.

## Notifications

The reminder loop lives in the workspace crate `src-tauri/reminder-core/` (platform-agnostic). On Linux it runs in a separate `rencal-notifierd` daemon (systemd user service, install via
`just install-notifierd`); the GUI's `lib.rs::setup` detects the active daemon and skips its
own loop. macOS/Windows always run the loop in-process via `tauri-plugin-notification`. Test with `just test-notification`.

See [docs/notifications.md](./docs/notifications.md) for details on the catch-up window,
the delivered-reminder cache, per-event collapse, the Linux notify-send workaround, and how to share logs in bug reports.
