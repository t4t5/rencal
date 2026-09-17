# renCal Agent Guide

renCal is a Tauri v2 calendar app for Omarchy.

## Commands

- `just typecheck`: check frontend TypeScript
- `just check`: check Rust/Tauri build
- `just gen-types`: regenerate TypeScript taurpc bindings
- `just debug [flags]`: run the app with `VITE_RENCAL_DEBUG` enabled

Run `just typecheck` after frontend changes.
Run `just check` after Rust / `src-tauri` changes.

## Architecture

- Rust backend: `src-tauri/src/`
- React frontend: `src/`
- taurpc bindings: `src/rpc/bindings.ts` generated from Rust
- Frontend should use app-level types/helpers, not raw RPC types unless at the boundary.
- Website & public docs: `website`

Important backend paths:

- `src-tauri/src/lib.rs`: taurpc router setup
- `src-tauri/src/state.rs`: `AppState` — the caldir handle, event cache, deep-link inbox
- `src-tauri/src/state_bridge.rs`: turns `AppState` change notifications into webview events
- `src-tauri/src/watchers/`: filesystem watchers (caldir data + config, rencal config, timezone)
- `src-tauri/src/fs_watch.rs`: debounced `notify` helper the watchers are built on
- `src-tauri/src/routes/caldir/`: caldir API procedures
- `src-tauri/src/routes/caldir/types.rs`: shared RPC types and conversions
- `src-tauri/src/routes/caldir/helpers.rs`: route helpers
- `src-tauri/src/oauth/`: OAuth primitives
- `src-tauri/src/notifications.rs`: notification setup

Important frontend paths:

- `src/main.tsx`: entry point
- `src/windows/`: app/settings windows
- `src/lib/cal-events.ts`: RPC ↔ frontend event conversion
- `src/lib/event-time.ts`: event date/time helpers
- `src/lib/shortcuts.ts`: global keyboard shortcuts

## Frontend rules

- Use pnpm for dependencies.
- Use Tailwind v4 and shadcn components.
- Icons must be React components in `src/icons`
- Use `cn` for conditional classes.
- Prefer padding and flex gaps over margins.
- Use absolute imports with `@/`.
- Only use relative imports for same-directory files, e.g. `./Sibling`.
- Never use `../`.
- Never use TypeScript `any`.
- For debugging frontend complexity (like scroll behaviour), add targeted `console.debug` logs gated by `isDebugMode` from `@/lib/debug`. Then test the app with `just debug` or `just debug [flags]`.

## Rust / taurpc rules

- Avoid `i64` / `u64` in taurpc route types; Specta exports these as BigInt.
- Use `i32` / `u32` instead.
- For fixed string sets, use Rust enums with `#[serde(rename = "...")]` variants.
- Regenerate bindings with `just gen-types` when route types change.
- Backend state lives in `AppState` (`src-tauri/src/state.rs`); never add process statics.
- Handlers take `&AppState`. Never hold `state.caldir()` across an `.await` — clone the
  `Provider` / `connections()` / config you need first, then await. (The guard is `!Send`,
  so this is a compile error, not a stall.)
- `AppState` is Tauri-free: no `AppHandle`, no `emit`. Backend tasks subscribe to its
  `watch` channels; `state_bridge.rs` is the one place that forwards them to the webview.
- Every state change notifies through `AppState`; handlers take an `AppHandle` only for
  platform services, never to tell the webview that state changed.
- State events carry the new value when the backend owns that value. Bare signals are for
  bulk calendar/event data that consumers refetch from disk.
- Watchers classify filesystem paths and call `AppState`; they do not emit state events.
- The event cache is private to `AppState`. Handlers invalidate it through
  `invalidate_events` / `invalidate_all_events`.
- Declare backend state-event names in `state_bridge.rs`.
- Spawn background tasks with `tasks::spawn_task`, and build watchers on
  `fs_watch::watch_debounced` (see `src-tauri/src/watchers/`).

## caldir/provider rules

renCal reads calendars/events from the local caldir directory via `caldir-core`.

Provider credential field IDs come from the caldir provider binaries.

`caldir-core` and the provider binaries are pinned separately in `src-tauri/Cargo.toml`. Update the crate dependency normally. Change the provider release with `just bump-caldir <tag>`, which also regenerates `src-tauri/caldir-providers.sha256`; never edit the provider tag or checksum file by hand.

## Event date/time rules

- Read `docs/event-time-system.md` before changing event date/time logic.
- Always use `EventTime` and helpers from `@/lib/event-time`.
- Never parse, format, or convert event start/end values with native `Date` or raw ISO-string helpers.

## Navigation rules

- To change `activeDate`, prefer `navigateToDate`.
- Only use raw `setActiveDate` when intentionally suppressing navigation side effects.

## Feature-specific notes

- Infinite scroll (in Month/Week views): `docs/scroll-behaviour.md`
- Drag to reschedule (in Month/Week views): `docs/drag-to-reschedule.md`
- Drag to create (in Month/Week views): `docs/drag-to-create.md`
- Natural language input: `src/lib/magic-parser.ts`
- Agenda keyboard nav: `src/components/sidebar/agenda/`
- Notifications: `docs/notifications.md`, `src-tauri/reminder-core/`
- Themes: `src/themes/README.md`, `src/themes/manifest.ts`, `src/global.css`
- Omarchy theme: `src/hooks/useOmarchyTheme.ts`, `src/themes/omarchy.css`

## Website rules

- `website` is a standalone Astro project (Tailwind v4 + Starlight) with its own `package.json` / `pnpm-lock.yaml`; CI builds it with `pnpm install --ignore-workspace`.
- Manage website deps with `--ignore-workspace` (e.g. `cd website && pnpm add --ignore-workspace <pkg>`). The repo root has a `pnpm-workspace.yaml`, so a plain `pnpm add` writes the dep to the root `pnpm-lock.yaml` instead of `website/pnpm-lock.yaml`, which breaks CI's `--frozen-lockfile` build.
- The website uses relative imports (no `@/` alias); the `src/` Frontend rules above don't apply here.
