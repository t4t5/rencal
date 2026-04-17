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
- If formatting a date, ALWAYS use a function in `@lib/time.ts` (or make a new one). NEVER use `.toISOString()` or `toLocaleString()`
- _NEVER_ use the `any` type in TypeScript! Always aim to have as precise types as possible. If
  you're using `any`, you're doing something wrong.
- Avoid using `i64`/`u64` in taurpc route types — Specta forbids BigInt exports to TypeScript. Use `i32`/`u32` instead.
- Provider credential field IDs (used in `connect_provider_with_credentials`) are defined by the caldir provider binaries, NOT by Rencal. Always check the provider source code for the expected field IDs (e.g., iCloud expects `apple_id` and `app_password`, not `email`/`password`).
- For taurpc types with a fixed set of string values, use a Rust enum with `#[serde(rename = "...")]` variants instead of `String`. Specta generates these as TypeScript string literal unions (e.g., `ResponseStatus = "accepted" | "declined" | ...`). See `ResponseStatus` in `caldir.rs` for the pattern.

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

## Natural Language Event Input

The header input parses natural language into structured event fields using `src/lib/parse-event-text.ts`. Parsing is debounced (300ms) in `EventDraftContext.setText` and extracts three things in order:

1. **Recurrence** — "every week", "every saturday", "every weekday", etc. Produces an rrule string. Day names are kept in the text so chrono can resolve the start date.
2. **Time/date** — Powered by chrono-node. Handles "at 3pm", "tomorrow", "next Friday at 10am", etc. The matched text (plus connector words like "at", "on") is stripped from the summary.
3. **Location** — After time extraction, any trailing "at ..." or "in ..." in the summary is treated as a location (e.g. "dinner at Luigi's at 7pm" → location "Luigi's").

## Notifications

Desktop notifications for calendar reminders run as a background tokio task spawned in
`lib.rs::setup()`. The loop aligns to minute boundaries, then scans caldir for events with
reminders whose trigger time (event start minus reminder minutes) falls within the last 60-second window, and fires a desktop notification via `tauri-plugin-notification`. No frontend involvement or state DB needed. Test with `just test-notification`.
