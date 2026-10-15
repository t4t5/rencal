# Frontend (React + Tailwind v4 + shadcn)

- Icons must be React components in `src/icons`.
- Use `cn` for conditional classes.
- Prefer padding and flex gaps over margins.
- Put `DialogHeader` first in `DialogContent`, with no margins or centering wrappers around it: themes style it as a title bar (see `src/themes/README.md`).
- Backend access goes through the app API in `src/lib/api/` (see "App API boundary" below), never the raw `rpc` proxy.
- Debugging complex behaviour (e.g. scroll): add targeted `console.debug` logs gated by `isDebugMode` from `@/lib/debug`, then test with `just debug [flags]`.

## App API boundary

- `src/lib/api/` is the only frontend code that calls the generated `rpc` proxy. Consumers use the `api` resource facade and supported types from `@/lib/api`; they do not import resource implementation modules. `notifications` wraps native app notifications and `errors` classifies caught failures (`isRenCalError`/`getErrorMessage`).
- Host-only orchestration imports the narrow `@/lib/api/internal` surface for full-record event replacement, recurrence primitives, frontend broadcasts, native decoration checks, and destructive deep-link draining. These operations are intentionally absent from the public client.
- ESLint rejects `@/rpc`, `@/rpc/*`, `@tauri-apps/api/event`, and direct `@/lib/api/*` implementation imports elsewhere. Only `@/lib/api/internal` and the existing pure conversion modules (`lib/cal-events.ts`, `lib/conference.ts`, `lib/event-time/rpc.ts`) have narrow exceptions.
- Event-returning operations produce the app `CalendarEvent` (`EventTime` + `dateInfo`); mutation inputs take app values and are converted once in `lib/api/calendar-events.ts`. Never call `rpcToCalendarEvent`/`toRpcEventTime` outside `lib`.
- Supported DTOs and domain types are exported from `@/lib/api`; add a new alias next to its operation module and re-export it from the public entry point rather than importing generated bindings.
- Facade modules never import UI or contexts. Recurrence-scope decisions, optimistic updates, toasts and dialogs stay with their current owners; the facade only does transport and conversion and leaves caught failures as `unknown`.

## Plugins

- Views are registered in `src/views/manifest.ts` and read through `useViews()`; never hardcode the view list.
- Built-in plugins live in `src/plugins/<id>/` (year). They import the host only through `@/sdk`, plus `./Sibling` files; ESLint enforces this. Grow `src/sdk/` deliberately: every export is a contract third-party plugins will rely on.
- Installed view plugins are registered by `src/views/ViewRegistry.tsx`. Their scripts import `@rencomputer/rencal-sdk`, `react`, `react-dom`, `react/jsx-runtime` and `@js-temporal/polyfill`, which `src/views/plugin-modules.ts` links to the host's own modules. The list lives in `src/views/shared-modules.ts`; `packages/sdk/build.js` (the `rencal-sdk` build command) leaves those modules out of plugin bundles. Run `just sdk` after changing `src/sdk/` to regenerate the types in `packages/sdk/`, and bump `packages/sdk/package.json` before `just publish-sdk`. Board lives in its own repository (`rencal-view-board`) as the reference view plugin.

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
