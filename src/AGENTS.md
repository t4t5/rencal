# Frontend (React + Tailwind v4 + shadcn)

- Icons must be React components in `src/icons`.
- Use `cn` for conditional classes.
- Prefer padding and flex gaps over margins.
- Backend access goes through the app API in `src/lib/api/` (see "App API boundary" below), never the raw `rpc` proxy.
- Debugging complex behaviour (e.g. scroll): add targeted `console.debug` logs gated by `isDebugMode` from `@/lib/debug`, then test with `just debug [flags]`.

## App API boundary

- `src/lib/api/` is the only frontend code that calls the generated `rpc` proxy. Each module exports named operations with app-level arguments and results: `calendar-events` (event reads/writes), `calendars`, `settings`, `providers`, `contacts`, `sync`, `themes`, `platform`. `events` wraps app notifications (`listenAppEvent`/`emitAppEvent`) and `errors` classifies caught failures (`isRpcError`/`getErrorMessage`).
- Components, contexts, hooks, themes and other `lib` modules import from `@/lib/api/*`; ESLint rejects `@/rpc`, `@/rpc/*` and `@tauri-apps/api/event` elsewhere. Only the pure conversion modules (`lib/cal-events.ts`, `lib/conference.ts`, `lib/event-time/rpc.ts`) may still reference generated types.
- Event-returning operations produce the app `CalendarEvent` (`EventTime` + `dateInfo`); mutation inputs take app values and are converted once in `lib/api/calendar-events.ts`. Never call `rpcToCalendarEvent`/`toRpcEventTime` outside `lib`.
- App-level DTO aliases: `Calendar` from `@/lib/api/calendars`; `EventAttendee`/`ResponseStatus` from `@/lib/cal-events`; `TimeFormat`/`FirstDayOfWeek` from `@/lib/event-time`. Add a new alias next to its operation module rather than importing bindings.
- Facade modules never import UI or contexts. Recurrence-scope decisions, optimistic updates, toasts and dialogs stay with their current owners; the facade only does transport and conversion and leaves caught failures as `unknown`.

## Event date/time

- Read `docs/event-time-system.md` before changing event date/time logic.
- Always use `EventTime` and helpers from `@/lib/event-time`.
- Never parse, format, or convert event start/end values with native `Date` or raw ISO-string helpers.

## Navigation

- To change `activeDate`, prefer `navigateToDate`.
- Only use raw `setActiveDate` when intentionally suppressing navigation side effects.

## Feature docs

- Infinite scroll (Month/Week): `docs/scroll-behaviour.md`
- Drag to reschedule: `docs/drag-to-reschedule.md`
- Drag to create: `docs/drag-to-create.md`
- Natural language input: `src/lib/magic-parser.ts`
- Agenda keyboard nav: `src/components/sidebar/agenda/`
- Themes: `src/themes/README.md`; Omarchy theme: `src/hooks/useOmarchyTheme.ts`, `src/themes/omarchy.css`
