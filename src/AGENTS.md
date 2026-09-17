# Frontend (React + Tailwind v4 + shadcn)

- Icons must be React components in `src/icons`.
- Use `cn` for conditional classes.
- Prefer padding and flex gaps over margins.
- Use app-level types/helpers, not raw RPC types from `src/rpc/bindings.ts`, unless at the boundary.
- Debugging complex behaviour (e.g. scroll): add targeted `console.debug` logs gated by `isDebugMode` from `@/lib/debug`, then test with `just debug [flags]`.

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
