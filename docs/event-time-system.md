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

## Rules

Use helpers from `@/lib/event-time` for construction, display, arithmetic, edits, ranges, and ordering.

Never use these on event start/end values:

- `.toISOString()`
- `.toLocaleString()`
- `parseISO(...)`
- `new Date(string)`

Do not add an `allDay: boolean`; `kind: "date"` already encodes all-day events.

Use `instantForOrdering(et)` only when you need a comparable ordering projection. Do not use ordering projections as the source of truth for edits or recurrence.

When changing an event range, use `withDates(...)` from `src/lib/cal-events.ts` so the cached `dateInfo` projection is recomputed.
