# renCal event time system

renCal stores calendar event times in the shape calendar formats actually use, instead of forcing everything into UTC.

## Model

Frontend app code uses `EventTime` from `@/lib/event-time`:

```ts
type EventTime =
  | { kind: "date"; value: Temporal.PlainDate }
  | { kind: "datetime_utc"; value: Temporal.Instant }
  | { kind: "datetime_floating"; value: Temporal.PlainDateTime }
  | { kind: "datetime_zoned"; value: Temporal.ZonedDateTime }
```

Meanings:

- `date`: all-day date, no clock, no timezone.
- `datetime_floating`: wall-clock date/time with no timezone.
- `datetime_zoned`: wall-clock date/time plus an IANA timezone, e.g. `09:00 Europe/Stockholm`.
- `datetime_utc`: a true UTC instant.

Most scheduled events should be treated as wall-clock time. A recurring 09:00 meeting in `Europe/Stockholm` should remain 09:00 across DST changes; the UTC instant is only a derived projection.

## Data flow

The same model crosses the stack:

1. Rust/caldir event times on disk.
2. `RpcEventTime` over taurpc.
3. Frontend `EventTime` in app code.

Conversion happens at the frontend boundary in `src/lib/cal-events.ts` using `src/lib/event-time/rpc.ts`. Normal UI code should use `CalendarEvent`, `Recurrence`, and `EventTime`, not raw RPC event time strings.

## Viewer timezone

The viewer's IANA zone comes from `getViewerTzid()` in `src/lib/event-time/local-zone.ts`. It is seeded from `Intl` once and then kept current by the Rust-side watcher (`src-tauri/src/tz_watcher.rs`), which emits `SYSTEM_TZ_CHANGED` when `/etc/localtime` changes. The webview's own zone is fixed at launch, so app code never uses JS `Date` components to determine a calendar day.

- Use `today()` or `useToday()` for the current viewer-zone day and `Temporal.Now.zonedDateTimeISO(getViewerTzid())` for the current wallclock.
- Use `dateInViewerZone(et)` to project an event onto the viewer's calendar, and use the event-time display helpers to render days.
- `CalEventsContext` recomputes every event's `dateInfo` when the zone changes; other cached zone-dependent values must subscribe with `useViewerTzid()` or `subscribeViewerTzid()`.

## Rules

Calendar days in app state, props, hooks, and helpers are `Temporal.PlainDate`. Use an ISO `YYYY-MM-DD` date key only for map keys and DOM attributes. Use helpers from `@/lib/event-time` for construction, display, arithmetic, edits, ranges, and ordering.

JS `Date` exists only at third-party boundaries (example: react-day-picker in `ui/date-picker.tsx`, chrono-node in `magic-parser.ts`, rrule.js in `rrule-utils.ts`). Convert at the boundary with `plainDateToJsDate` and `jsDateToPlainDate` from `event-time/js-date.ts`; non-boundary application code must not import those converters.

Never use these on event start/end values:

- `.toISOString()`
- `.toLocaleString()`
- `parseISO(...)`
- `new Date(string)`

Do not add an `allDay: boolean`; `kind: "date"` already encodes all-day events.

Ordering projections such as `instantForOrdering(et)` stay internal to event-time. Do not use them as the source of truth for edits or recurrence.

When changing an event range, use `withDates(...)` from `src/lib/cal-events.ts` so the cached `dateInfo` projection is recomputed.
