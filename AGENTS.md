# renCal Agent Guide

renCal is a Tauri v2 calendar app for Omarchy.

## Commands

- `just typecheck`: check frontend TypeScript
- `just check`: check Rust/Tauri build
- `just gen-types`: regenerate TypeScript taurpc bindings

Run `just typecheck` after frontend changes.
Run `just check` after Rust / `src-tauri` changes.

## Architecture

- Rust backend: `src-tauri/src/`
- React frontend: `src/`
- taurpc bindings: `src/rpc/bindings.ts` generated from Rust
- Frontend should use app-level types/helpers, not raw RPC types unless at the boundary.

Important backend paths:

- `src-tauri/src/lib.rs`: taurpc router setup
- `src-tauri/src/routes/caldir/`: caldir API procedures
- `src-tauri/src/routes/caldir/types.rs`: shared RPC types
- `src-tauri/src/routes/caldir/helpers.rs`: conversion helpers
- `src-tauri/src/oauth/`: OAuth primitives
- `src-tauri/src/notifications.rs`: notification setup

Important frontend paths:

- `src/main.tsx`: entry point
- `src/windows/`: app/settings windows
- `src/lib/cal-events.ts`: RPC ↔ frontend event conversion
- `src/lib/event-time.ts`: event date/time helpers

## Frontend rules

- Use pnpm for dependencies.
- Use Tailwind v4 and shadcn components.
- Use `react-icons` for icons.
- Use `cn` for conditional classes.
- Prefer padding and flex gaps over margins.
- Use absolute imports with `@/`.
- Only use relative imports for same-directory files, e.g. `./Sibling`.
- Never use `../`.
- Never use TypeScript `any`.

## Rust / taurpc rules

- Avoid `i64` / `u64` in taurpc route types; Specta exports these as BigInt.
- Use `i32` / `u32` instead.
- For fixed string sets, use Rust enums with `#[serde(rename = "...")]` variants.
- Regenerate bindings with `just gen-types` when route types change.

## caldir/provider rules

renCal reads calendars/events from the local caldir directory via `caldir-core`.

Provider credential field IDs come from the caldir provider binaries.

## Event date/time rules

Read `docs/event-time-system.md` before changing event date/time logic.

Always use `EventTime` and helpers from `@/lib/event-time`.
Never parse, format, or convert event start/end values with native `Date` or raw ISO-string helpers.

## Navigation rules

To change `activeDate`, prefer `navigateToDate`.
Only use raw `setActiveDate` when intentionally suppressing navigation side effects.

Before changing infinite scroll behavior, read:

- `src/components/main/month-view/Grid.tsx`
- `src/components/main/week-view/WeekTimeGrid.tsx`

## Feature-specific notes

Before modifying these areas, read the relevant source/docs first:

- Themes: `src/themes/README.md`, `src/themes/manifest.ts`, `src/global.css`
- Omarchy theme: `src/hooks/useOmarchyTheme.ts`, `src/themes/omarchy.css`
- Natural language input: `src/lib/magic-parser.ts`
- Agenda keyboard nav: `src/components/sidebar/agenda/`
- Notifications: `docs/notifications.md`, `src-tauri/reminder-core/`
