# rencal-time

The event time model (`GPUI_PORT_PLAN.md` §5): port of `src/lib/event-time/*`, `src/lib/cal-events.ts`, `src/lib/cal-events-range.ts` and the pure parts of `src/lib/event-utils.ts`. No GPUI, no IO. Spec: `docs/event-time-system.md`.

## Layout

- `src/time.rs`: `EventTime` (`Date`, `Utc`, `Floating`, `Zoned(DateTime<Tz>)`), `EventTimeRange`, and the RPC wire form (`WireEventTime`; `EventTime`'s serde is that shape). `PartialEq` is TS `isSameEventTime` (zone included).
- `src/zoned.rs`: Temporal `ZonedDateTime` semantics on chrono. All wallclock → instant resolution goes through `resolve_local` ("compatible": DST gap → later, overlap → earlier) or `resolve_local_prefer_offset` (`ZonedDateTime.with`).
- `src/projections.rs`, `src/date_info.rs`: viewer-zone projections and `EventDateInfo` (`compute`, `occupied_days`, `covers_full_day`).
- `src/edit.rs`, `src/range.rs`: single-value edits (methods on `EventTime`, plus `at_time`) and editor range edits (methods on `EventTimeRange`).
- `src/day.rs`: epoch days, `FirstDayOfWeek`, `start_of_week`, `iso_week_number`.
- `src/display.rs`: English strings matching the old `Intl` en-GB/en-US output. `src/tz.rs`: picker zone list and labels.
- `src/event.rs`: `CalendarEvent`, `Calendar`, recurrence/attendee/conference types (serde = RPC shape), `EventKey`, optimistic-create reconciliation, `merge_events`, `start_range_for_date`.
- `tests/fixtures.rs`: golden fixtures from the TS implementation (`scripts/fixtures/time.fixtures.ts`). `tests/event_time.rs`: the ported vitest suites.

## Rules

- No globals: the viewer's zone is a `viewer: Tz` argument and "today" a `today: NaiveDate` argument. The TS viewer-zone store and its subscribers are the app's job (the tz watcher updates a global; the event store calls `CalendarEvent::refresh_date_info` for every event when it changes).
- Never resolve a wallclock with chrono's `from_local_datetime(..).single()`/`earliest()` directly; use `zoned::resolve_local` so DST behaviour matches the fixtures.
- `CalendarEvent::date_info` is `#[serde(skip)]`: after deserializing or editing start/end, call `with_viewer`/`refresh_date_info`/`set_dates`.
- Event ids are unique only per calendar; key maps and dedup by `EventKey` (`{calendar_slug}::{id}`).
- Unknown or non-IANA zone ids fail to parse (`ParseError`); the caller skips that event, as `rpcToCalendarEvents` did.

## Decisions

- Own `EventTime` instead of caldir-core's: caldir stores a zoned value as wallclock + unvalidated tzid string, while the UI needs Temporal's instant + parsed zone (wallclocks in DST gaps normalise on parse, `add_days` keeps the wallclock, `add_minutes` is exact). Conversions to caldir-core types belong in `rencal-core`, which depends on both.
- The event model types (`CalendarEvent`, `Calendar`, `EventConference`, …) mirror rencal-core's RPC types field for field. Until cutover rencal-core keeps its own copies for the Tauri bindings.
- `list_time_zones` approximates `Intl.supportedValuesOf("timeZone")` with chrono-tz ids under the IANA regions (drops legacy aliases like `US/Eastern`, but keeps region aliases like `Asia/Calcutta`) plus `UTC`.
- Short month names follow current ICU en-GB, so September is "Sept".
