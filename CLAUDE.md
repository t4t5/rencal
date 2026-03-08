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

## Rules

- If implementing a frontend feature, run "just typecheck" in the end to make sure the TypeScript
  compiled.
- If implementing a feature in Rust (`src-tauri`), run "just check" to make sure the app compiles!
- If formatting a date, always use the date-fns `format` function instead of something like
  `.toISOString()`
- _NEVER_ use the `any` type in TypeScript! Always aim to have as precise types as possible. If
  you're using `any`, you're doing something wrong.
- Avoid using `i64`/`u64` in taurpc route types — Specta forbids BigInt exports to TypeScript. Use
  `i32`/`u32` instead.
- Provider credential field IDs (used in `connect_provider_with_credentials`) are defined by the
  caldir provider binaries, NOT by Rencal. Always check the provider source code for the expected
  field IDs (e.g., iCloud expects `apple_id` and `app_password`, not `email`/`password`).

## Calendar Data (caldir)

Rencal reads calendars and events from the local caldir directory (`~/calendar/`) via the
`caldir-core` Rust crate. The Rust backend exposes caldir operations as taurpc procedures
(`src-tauri/src/routes/caldir.rs`), and the frontend calls them via `rpc.caldir.*`.

Calendars are listed from caldir and grouped by account in the settings UI. The account identifier
comes from the `{provider}_account` field in each calendar's `.caldir/config.toml` (e.g.,
`google_account`, `icloud_account`). See the caldir CLAUDE.md for the account identifier convention.

## Notifications

Desktop notifications for calendar reminders run as a background tokio task spawned in
`lib.rs::setup()`. Every 60 seconds it scans caldir for events with reminders whose trigger time
(event start minus reminder minutes) falls within the last 60-second window, and fires a desktop
notification via `notify-rust`. No frontend involvement or state DB needed. Test with
`just test-notification`.

## Local Database

Rencal uses a local SQLite database (via Drizzle) only for app-specific state like calendar
visibility preferences. All calendar and event data lives in caldir (`~/calendar/`).

Schema is defined in `src/db/schema.ts`. To create a migration, change the schema and run
`just migrate {your_description}`. This generates a `sql` file in `src-tauri/src/migrations/`.

When the app gets built, everything in `src-tauri/src/migrations/` get auto-generated into an
updated `src-tauri/src/migrations.rs`. When the app runs, migrations get applied automatically.
