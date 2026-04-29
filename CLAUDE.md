# Rencal

A calendar app crafted especially for Omarchy.

## Commands

- `just check`: check for errors
- `just gen-types`: generate typescript bidnings from rust

## Architecture

This is a Tauri v2 application with a Rust backend and React frontend.

The Rust backend is kept as minimal as possible. It handles caldir operations (reading/writing
calendars and events from `~/calendar/`) and OAuth flows. The frontend handles UI state and
communicates with the backend via taurpc.

### Backend (Rust)

- `src-tauri/src/lib.rs` - Registers taurpc routers
- `src-tauri/src/oauth/` - Low-level OAuth primitives (localhost callback server, native popup window)
- `src-tauri/src/routes/caldir.rs` - taurpc API procedures, including `connect_provider` (OAuth
  flow) and `connect_provider_with_credentials` (credentials flow like iCloud)
- `src-tauri/src/notifications.rs` - Background reminder notifications
- TypeScript bindings are auto-generated as `src/rpc/bindings.ts`

### Frontend (React)

- `src/App.tsx` - Main React application entry point
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
- Provider credential field IDs (used in `connect_provider_with_credentials`) are defined by the caldir provider binaries, NOT by Rencal. Always check the provider source code for the expected field IDs (e.g., iCloud expects `apple_id` and `app_password`, not `email`/`password`).
- For taurpc types with a fixed set of string values, use a Rust enum with `#[serde(rename = "...")]` variants instead of `String`. Specta generates these as TypeScript string literal unions (e.g., `ResponseStatus = "accepted" | "declined" | ...`). See `ResponseStatus` in `caldir.rs` for the pattern.
- To change `activeDate`, prefer `navigateToDate` over the raw `setActiveDate` setter from `useCalendarNavigation`. `navigateToDate` also syncs the sidebar `EventList` scroll position and lazy-loads events for distant dates. Only reach for `setActiveDate` if you specifically need to suppress those side effects.

## Bundled Providers

RenCal bundles the Google, iCloud, Outlook, CalDAV, and WebCal caldir provider binaries so they work out of the box. The
`just dev` / `just build` recipes compile them from `../caldir/` into `src-tauri/providers/`. At
startup, `lib.rs` sets the `CALDIR_PROVIDER_PATH` env var to point at that directory. caldir-core's
`discover_installed()` checks `CALDIR_PROVIDER_PATH` before `PATH`, so bundled providers are found
alongside any user-installed ones. The providers are shipped as Tauri bundle resources (configured in
`tauri.conf.json`).

## Calendar Data (caldir)

Rencal reads calendars and events from the local caldir directory (`~/calendar/`) via the
`caldir-core` Rust crate. The Rust backend exposes caldir operations as taurpc procedures
(`src-tauri/src/routes/caldir.rs`), and the frontend calls them via `rpc.caldir.*`.

Calendars are listed from caldir and grouped by account in the settings UI. The account identifier
comes from the `{provider}_account` field in each calendar's `.caldir/config.toml` (e.g.,
`google_account`, `icloud_account`). See the caldir CLAUDE.md for the account identifier convention.

## Dates and times

Event datetimes carry **wall-clock + IANA timezone** (e.g. `12:00 / Europe/Stockholm`), not a UTC instant. The wall-clock is the source of truth — the instant is derived. This matches RFC 5545 (iCalendar), RFC 8984 (JSCalendar), and the Google/Outlook calendar APIs, and means recurring events behave correctly across DST transitions ("every weekday at 9am" stays at 9am wall-clock year-round).

### Three layers

1. **caldir on disk** — `EventTime` enum in `caldir-core/src/event.rs`: `Date` / `DateTimeUtc` / `DateTimeFloating` / `DateTimeZoned { datetime, tzid }`.
2. **RPC (taurpc)** — `RpcEventTime` in `src-tauri/src/routes/caldir.rs`, a tagged union mirroring `EventTime` 1:1. `rpc_time_to_core` / `core_time_to_rpc` convert losslessly. RPC types use this directly: `CreateEventInput.start: RpcEventTime`, no separate `all_day: bool` (the variant carries it).
3. **Frontend** — `EventTime` in `src/lib/event-time`, backed by `Temporal.PlainDate` / `Temporal.Instant` / `Temporal.PlainDateTime` / `Temporal.ZonedDateTime` (via `@js-temporal/polyfill`).

### Boundary conversion

App code never sees `RpcEventTime`. The RPC adapter in `src/lib/cal-events.ts` parses to `EventTime` once at the boundary:

- **Reads** (`list_events`, `get_event`, `search_events`, `list_invites`): wrap responses with `rpcToCalendarEvent`.
- **Writes** (`create_event`, `update_event`, `split_recurring_series_at`): call `toRpcEventTime(et)` from `@/lib/event-time/rpc` on each datetime when building the payload.

The local `CalendarEvent` and `Recurrence` types in `@/lib/cal-events` carry `EventTime` fields; import these (not the RPC types from `@/rpc/bindings`) in app code.

### Helpers

- **Construction**: `nowZoned()`, `plainDate(y, m, d)`, `allDayFromLocalDate(jsDate)`, `fromDate(jsDate, tzid?)` (use the last only at JS-`Date`-producing boundaries: chrono-node, drag offsets, `<input type="datetime-local">`).
- **Display**: `formatTime(et, timeFormat)`, `formatDateKey(et)` (YYYY-MM-DD in viewer's local zone), `toViewerZonedDateTime(et)`, `toInteropDate(et)` (only for date-fns / DOM leaves).
- **Arithmetic**: `addMinutes(et, n)`, `addDays(et, n)`. Operates in the event's own zone — DST-correct.
- **Edits**: `withWallclockTime(et, h, m)` and `withEventDate(et, plainDate)` change the time/date of an event _in its own zone_, preserving zone identity. This matches Google Calendar's edit semantics: moving an LA-authored event from a Stockholm laptop keeps the event's wallclock in LA. `toTimedAtStartOfDay(et)` promotes an all-day to timed when the user toggles all-day off; `toAllDay(et)` is the inverse.
- **Predicates**: `isAllDay(et)`, `isSameDay(a, b)`.
- **Sort/range**: `instantForOrdering(et)` for ordering; `getEventDayRange(start, end)` for which local-zone days an event spans.

### Don't

- Don't call `.toISOString()`, `.toLocaleString()`, `parseISO(...)`, or `new Date(eventTimeString)` on event datetimes.
- Don't add an `allDay: boolean` sidecar; the variant `kind: "date"` already encodes it.
- Don't compute UTC instants from wall-clock + tzid in app code unless you genuinely need an ordering projection — `instantForOrdering(et)` exists for that.

## Infinite scroll rules

Both MonthView and WeekView use infinite scroll to navigate dates, and both update `activeDate` as the user scrolls. Each enforces invariants so that scroll-driven updates don't fight programmatic navigation or jump in the wrong direction.

### MonthView (`src/components/main/month-view/MonthGrid.tsx`)

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

## Natural Language Event Input

The header input parses natural language into structured event fields using `src/lib/parse-event-text.ts`. Parsing is debounced (300ms) in `EventDraftContext.setText` and extracts three things in order:

1. **Recurrence** — "every week", "every saturday", "every weekday", etc. Produces an rrule string. Day names are kept in the text so chrono can resolve the start date.
2. **Time/date** — Powered by chrono-node. Handles "at 3pm", "tomorrow", "next Friday at 10am", etc. The matched text (plus connector words like "at", "on") is stripped from the summary.
3. **Location** — After time extraction, any trailing "at ..." or "in ..." in the summary is treated as a location (e.g. "dinner at Luigi's at 7pm" → location "Luigi's").

## Themes

Themes live in `src/themes/<name>.css` and are scoped by `body[data-theme="<name>"]`. Each theme sets primitive tokens (e.g. `--background`, `--foreground`, `--hover-tint`, `--hover-mix`, `--primary`). The default (ren) values live in the `@theme` block in `src/global.css`.

Derived tokens like `--hover`, `--secondary`, `--secondary-hover`, and `--card` are declared in a `body { ... }` block in `global.css` using `color-mix()` over the primitives. They must live on `body` — not `:root` — because custom properties containing `var()` are resolved at the element where they're declared; descendants inherit the already-computed value. Declaring them on `body` lets the theme's override of `--hover-tint` / `--background` flow through.

To add a new theme:

1. Create `src/themes/<name>.css` with a `body[data-theme="<name>"] { ... }` block overriding whichever primitives you need.
2. Import it from `src/global.css`.
3. Set `data-theme="<name>"` on `<body>` to activate.

The `omarchy` theme is a special case. On Omarchy machines its primitives are injected at runtime from `~/.config/omarchy/current/theme/colors.toml` by `src/hooks/useOmarchyTheme.ts`, into a managed `<style>` element appended to `<head>`. A Rust file-watcher in `src-tauri/src/omarchy.rs` emits `omarchy-theme-changed` when the OS theme changes so Rencal repaints live. `src/themes/omarchy.css` holds a static Tokyo Night palette as a fallback for non-Omarchy users (e.g. the settings preview tile); the dynamic `<style>` wins via source order when present, not specificity, so don't strip the static values.

On first launch with no persisted preference, `useTheme.ts` defaults to `omarchy` if `rpc.omarchy.get_colors()` returns non-null (Omarchy detected on disk), otherwise to `ren` (the default everywhere else — macOS, Windows, non-Omarchy Linux). Subsequent launches use the persisted choice from `~/.config/rencal/config.toml`.

## Notifications

The reminder loop lives in the workspace crate `src-tauri/reminder-core/` (platform-agnostic). On
Linux it runs in a separate `rencal-notifierd` daemon (systemd user service, install via
`just install-notifierd`); the GUI's `lib.rs::setup` detects the active daemon and skips its
own loop. macOS/Windows always run the loop in-process via `tauri-plugin-notification`. Test with
`just test-notification`.

See [docs/notifications.md](./docs/notifications.md) for details on the catch-up window,
per-event dedup, the Linux notify-send workaround, and how to share logs in bug reports.
