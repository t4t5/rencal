# Rencal

A calendar app crafted especially for Omarchy.

## Commands

- `just check`: check for errors
- `just gen-types`: generate typescript bidnings from rust

## Architecture

This is a Tauri application with a Rust backend and React frontend.

The Rust backend is kept as minimal as possible and only used when absolutely necessary. All
actions, including SQLite operations are handled in the frontend.

### Backend (Rust)

- `src-tauri/src/lib.rs` - Registers taurpc routers
- `src-tauri/src/oauth/` - Low-level OAuth primitives (localhost callback server, native popup window)
- `src-tauri/src/routes/caldir.rs` - taurpc API procedures, including `connect_provider` which
  orchestrates the full caldir auth flow (auth_init → popup → callback → auth_submit →
  list_calendars → save configs)
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
- _NEVER_ use Drizzle's `returning()` method. It does not working with SQLite.
- Avoid using `i64`/`u64` in taurpc route types — Specta forbids BigInt exports to TypeScript. Use
  `i32`/`u32` instead.

## Calendar Data (caldir)

Rencal reads calendars and events from the local caldir directory (`~/calendar/`) via the
`caldir-core` Rust crate. The Rust backend exposes caldir operations as taurpc procedures
(`src-tauri/src/routes/caldir.rs`), and the frontend calls them via `rpc.caldir.*`.

Calendars are listed from caldir and grouped by account in the settings UI. The account identifier
comes from the `{provider}_account` field in each calendar's `.caldir/config.toml` (e.g.,
`google_account`, `icloud_account`). See the caldir CLAUDE.md for the account identifier convention.

## Migrations

We use Drizzle for our SQLite database schema.

To create a migration, change the schema in `src/db/schema.ts` and run `just migrate
{your_description}`. This will generate a `sql` file in `src-tauri/src/migrations/`.

When the app gets built, everything in `src-tauri/src/migrations/` get auto-generated into an updated `src-tauri/src/migrations.rs`.
When the app runs, migrations in `src-tauri/src/migrations.rs` get applied.
