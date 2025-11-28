# Rencal

A calendar app crafted especially for Omarchy.

## Commands

- `just check`: check for errors

## Architecture

This is a Tauri application with a Rust backend and React frontend.

The Rust backend is kept as minimal as possible and only used when absolutely necessary. All
actions, including SQLite operations are handled in the frontend.

### Backend (Rust)

- `src-tauri/src/lib.rs` - Registers taurpc routers
- `src-tauri/src/oauth/` - Low-level OAuth primitives (localhost server, native popup window)
- `src-tauri/src/routes/` - taurpc API procedures
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

## Google Calendar Integration

Uses standalone OAuth 2.0 authentication - no central Rencal server required:

1. User clicks "Connect Google Calendar"
2. Rust spawns temporary HTTP server on `localhost:8080` and opens native popup window
3. User authenticates with Google in the popup
4. Google redirects back to localhost with authorization code
5. TypeScript (using Arctic library) exchanges code for tokens via PKCE
6. App fetches calendar data directly from Google Calendar API

OAuth logic lives in `src/lib/oauth/google.ts` using the Arctic library. Rust only provides two primitives: `start_oauth_callback_server` and `open_oauth_window`.

### OAuth Security Model

The OAuth client ID and secret are embedded in `src/lib/oauth/google.ts`. This is standard for desktop apps (similar to Thunderbird) and is not a security vulnerability. The embedded credentials just identify the app to Google, while PKCE provides the actual security against token theft.

### Event Sync

Events are synced from Google Calendar to a local SQLite database for offline access and fast reads. The sync uses Google's incremental sync API with sync tokens - after the initial full sync, subsequent syncs only fetch changed/deleted events. The `useSyncEvents` hook triggers sync on mount and every 30 seconds, while `useLocalEvents` reads from SQLite for instant UI. All entities use our own UUIDs as primary keys with optional `google_calendar_id`/`google_event_id` fields for provider mapping.

## Migrations

We use Drizzle for our SQLite database schema.

To create a migration, change the schema in `src/db/schema.ts` and run `just migrate
{your_description}`. This will generate a `sql` file in `src-tauri/src/migrations/`.

When the app gets built, everything in `src-tauri/src/migrations/` get auto-generated into an updated `src-tauri/src/migrations.rs`.
When the app runs, migrations in `src-tauri/src/migrations.rs` get applied.
