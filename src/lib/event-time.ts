/*
 * Datetime primitive for rencal events.
 *
 * Calendar data is not one kind of time. Each variant exists because there is
 * no single underlying type (Date, Instant, ZonedDateTime) that fits all four
 * cases without forcing fake information into the model:
 *
 *   - "date" (Temporal.PlainDate) — a calendar date, no clock, no zone.
 *     Example: an all-day birthday on 2026-04-28. It must stay April 28
 *     everywhere. Modeled as midnight UTC, a Los Angeles user would see
 *     April 27 17:00 — wrong.
 *
 *   - "datetime_floating" (Temporal.PlainDateTime) — wall-clock with no zone.
 *     Example: an ICS floating event "2026-04-28 09:00". It means 9am in
 *     whatever local context the calendar uses, not a globally fixed instant.
 *     Forcing a zone onto it would change the data.
 *
 *   - "datetime_zoned" (Temporal.ZonedDateTime) — wall-clock + named timezone.
 *     Example: "2026-04-28 09:00 Europe/Stockholm". This is what most authored
 *     timed events should be. It preserves the original TZID, handles DST,
 *     and keeps recurring meetings at 9am Stockholm time even when offsets
 *     change.
 *
 *   - "datetime_utc" (Temporal.Instant) — a genuine UTC instant. Used for
 *     things produced as UTC at the source (some ICS feeds, some APIs).
 *
 * The four variants mirror caldir-core's EventTime 1:1 (and RFC 5545 / RFC
 * 8984 / JSCalendar). Wall-clock + IANA zone is the source of truth for zoned
 * events — the UTC instant is computed when needed.
 *
 * App code should call helpers (formatTime, toLocalDate, isAllDay,
 * withWallclockTime, withCalendarDate, etc.) rather than juggle Temporal types
 * directly. Never call .toISOString(), .toLocaleString(), or `new Date(string)`
 * on event times.
 */
import { Temporal } from "@js-temporal/polyfill"
import { format, getYear, isToday, isTomorrow, isYesterday } from "date-fns"

import type { TimeFormat, WireEventTime } from "@/rpc/bindings"

export type EventDateTime =
  | { kind: "date"; value: Temporal.PlainDate }
  | { kind: "datetime_utc"; value: Temporal.Instant }
  | { kind: "datetime_floating"; value: Temporal.PlainDateTime }
  | { kind: "datetime_zoned"; value: Temporal.ZonedDateTime }

// ---------------------------------------------------------------------------
// Local zone
// ---------------------------------------------------------------------------

/**
 * The viewer's IANA timezone (e.g. "Europe/Stockholm"). Cached for the lifetime
 * of the JS context — Intl.DateTimeFormat construction is expensive and the
 * viewer's zone effectively does not change mid-session.
 */
let cachedLocalTzid: string | undefined
export function getLocalTzid(): string {
  if (cachedLocalTzid === undefined) {
    cachedLocalTzid = Intl.DateTimeFormat().resolvedOptions().timeZone
  }
  return cachedLocalTzid
}

// ---------------------------------------------------------------------------
// Wire conversion
// ---------------------------------------------------------------------------

export function fromWire(w: WireEventTime): EventDateTime {
  switch (w.kind) {
    case "date":
      return { kind: "date", value: Temporal.PlainDate.from(w.date) }
    case "datetime_utc":
      return { kind: "datetime_utc", value: Temporal.Instant.from(w.instant) }
    case "datetime_floating":
      return { kind: "datetime_floating", value: Temporal.PlainDateTime.from(w.wallclock) }
    case "datetime_zoned":
      return {
        kind: "datetime_zoned",
        value: Temporal.PlainDateTime.from(w.wallclock).toZonedDateTime(w.tzid),
      }
  }
}

export function toWire(et: EventDateTime): WireEventTime {
  switch (et.kind) {
    case "date":
      return { kind: "date", date: et.value.toString() }
    case "datetime_utc":
      return { kind: "datetime_utc", instant: et.value.toString() }
    case "datetime_floating":
      // PlainDateTime.toString() includes seconds (e.g. "2026-04-28T12:00:00").
      return { kind: "datetime_floating", wallclock: et.value.toString({ smallestUnit: "second" }) }
    case "datetime_zoned":
      return {
        kind: "datetime_zoned",
        wallclock: et.value.toPlainDateTime().toString({ smallestUnit: "second" }),
        tzid: et.value.timeZoneId,
      }
  }
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** A ZonedDateTime "now" in the viewer's local zone. */
export function nowZoned(): EventDateTime {
  return {
    kind: "datetime_zoned",
    value: Temporal.Now.zonedDateTimeISO(getLocalTzid()),
  }
}

/**
 * Bridge for libraries that produce a JS `Date` (chrono-node, drag offsets,
 * `<input type="datetime-local">`). Interprets the Date's instant in the given
 * zone (or viewer's local zone) and produces a zoned EventDateTime.
 */
export function fromDate(d: Date, tzid: string = getLocalTzid()): EventDateTime {
  const instant = Temporal.Instant.fromEpochMilliseconds(d.getTime())
  return {
    kind: "datetime_zoned",
    value: instant.toZonedDateTimeISO(tzid),
  }
}

/** All-day event at the given calendar date. */
export function plainDate(year: number, month: number, day: number): EventDateTime {
  return {
    kind: "date",
    value: new Temporal.PlainDate(year, month, day),
  }
}

/** Bridge: take a JS Date in viewer's local zone and produce a date-only EventDateTime. */
export function dateToPlainDate(d: Date): EventDateTime {
  return plainDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export function isAllDay(et: EventDateTime): boolean {
  return et.kind === "date"
}

/** UTC instant. For all-day, the start of the calendar date in UTC. */
export function toInstant(et: EventDateTime): Temporal.Instant {
  switch (et.kind) {
    case "date":
      return et.value.toZonedDateTime("UTC").toInstant()
    case "datetime_utc":
      return et.value
    case "datetime_floating":
      // Floating has no zone; treat as UTC for ordering purposes.
      return et.value.toZonedDateTime("UTC").toInstant()
    case "datetime_zoned":
      return et.value.toInstant()
  }
}

/**
 * Convert to a ZonedDateTime in the viewer's local zone. Used for rendering and
 * arithmetic that needs to be expressed in the viewer's clock.
 */
export function toLocalZoned(et: EventDateTime): Temporal.ZonedDateTime {
  const tzid = getLocalTzid()
  switch (et.kind) {
    case "date":
      return et.value.toZonedDateTime(tzid)
    case "datetime_utc":
      return et.value.toZonedDateTimeISO(tzid)
    case "datetime_floating":
      return et.value.toZonedDateTime(tzid)
    case "datetime_zoned":
      return et.value.withTimeZone(tzid)
  }
}

/**
 * The viewer-local calendar date this event sits on. For all-day events the
 * date itself; for timed events the date in the viewer's local zone.
 */
export function toLocalDate(et: EventDateTime): Temporal.PlainDate {
  if (et.kind === "date") return et.value
  return toLocalZoned(et).toPlainDate()
}

/** A JS `Date` snapshotting this event's instant. Use only at leaves where DOM/3rd-party APIs require Date. */
export function toJsDate(et: EventDateTime): Date {
  return new Date(toInstant(et).epochMilliseconds)
}

export function isSameDay(a: EventDateTime, b: EventDateTime): boolean {
  return toLocalDate(a).equals(toLocalDate(b))
}

/**
 * Promote an all-day `kind: "date"` to a timed ZonedDateTime in the viewer's
 * zone, anchored at the start of that date. Used when toggling all-day off.
 */
export function toTimedAtStartOfDay(et: EventDateTime): EventDateTime {
  if (et.kind !== "date") return et
  return {
    kind: "datetime_zoned",
    value: et.value.toZonedDateTime(getLocalTzid()),
  }
}

/**
 * Demote a timed event to an all-day PlainDate, taking the calendar date in
 * the viewer's local zone. Used when toggling all-day on.
 */
export function toAllDay(et: EventDateTime): EventDateTime {
  if (et.kind === "date") return et
  return { kind: "date", value: toLocalDate(et) }
}

/** Add minutes. For all-day, advances by whole days (n must be a multiple of 1440 — usually you want addDays). */
export function addMinutes(et: EventDateTime, minutes: number): EventDateTime {
  switch (et.kind) {
    case "date":
      // For all-day events, minute math doesn't make sense. Convert to days.
      return { kind: "date", value: et.value.add({ days: Math.round(minutes / 1440) }) }
    case "datetime_utc":
      return { kind: "datetime_utc", value: et.value.add({ minutes }) }
    case "datetime_floating":
      return { kind: "datetime_floating", value: et.value.add({ minutes }) }
    case "datetime_zoned":
      return { kind: "datetime_zoned", value: et.value.add({ minutes }) }
  }
}

export function addDays(et: EventDateTime, days: number): EventDateTime {
  switch (et.kind) {
    case "date":
      return { kind: "date", value: et.value.add({ days }) }
    case "datetime_utc":
      return {
        kind: "datetime_utc",
        value: et.value.toZonedDateTimeISO("UTC").add({ days }).toInstant(),
      }
    case "datetime_floating":
      return { kind: "datetime_floating", value: et.value.add({ days }) }
    case "datetime_zoned":
      return { kind: "datetime_zoned", value: et.value.add({ days }) }
  }
}

/**
 * The PlainDate of the event in its OWN zone — not the viewer's. Used by
 * editing UI so a Stockholm viewer sees an LA-zoned event's LA date.
 */
export function toEventDate(et: EventDateTime): Temporal.PlainDate {
  switch (et.kind) {
    case "date":
      return et.value
    case "datetime_zoned":
      return et.value.toPlainDate()
    case "datetime_floating":
      return et.value.toPlainDate()
    case "datetime_utc":
      // UTC has no other zone identity — render in the viewer's zone.
      return toLocalDate(et)
  }
}

/**
 * The wallclock {hour, minute} of the event in its OWN zone. For all-day
 * returns 0/0. Used by editing UI.
 */
export function getWallclockTime(et: EventDateTime): { hour: number; minute: number } {
  switch (et.kind) {
    case "date":
      return { hour: 0, minute: 0 }
    case "datetime_zoned":
      return { hour: et.value.hour, minute: et.value.minute }
    case "datetime_floating":
      return { hour: et.value.hour, minute: et.value.minute }
    case "datetime_utc":
      // UTC has no other zone identity — render in the viewer's zone.
      const z = toLocalZoned(et)
      return { hour: z.hour, minute: z.minute }
  }
}

/**
 * Replace the wallclock hour/minute in the event's own zone, preserving zone
 * identity. For all-day events this is a no-op (toggle all-day off first).
 */
export function withWallclockTime(et: EventDateTime, hour: number, minute: number): EventDateTime {
  switch (et.kind) {
    case "date":
      return et
    case "datetime_zoned":
      return {
        kind: "datetime_zoned",
        value: et.value.with({ hour, minute, second: 0, millisecond: 0 }),
      }
    case "datetime_floating":
      return {
        kind: "datetime_floating",
        value: et.value.with({ hour, minute, second: 0, millisecond: 0 }),
      }
    case "datetime_utc": {
      // UTC has no other zone identity — interpret the new wallclock in the
      // viewer's zone, then convert back to a UTC instant.
      const z = toLocalZoned(et).with({ hour, minute, second: 0, millisecond: 0 })
      return { kind: "datetime_utc", value: z.toInstant() }
    }
  }
}

/**
 * Replace the calendar date, preserving the wallclock and zone. For all-day
 * events this swaps the date directly.
 */
export function withCalendarDate(et: EventDateTime, newDate: Temporal.PlainDate): EventDateTime {
  switch (et.kind) {
    case "date":
      return { kind: "date", value: newDate }
    case "datetime_zoned":
      return {
        kind: "datetime_zoned",
        value: et.value.with({
          year: newDate.year,
          month: newDate.month,
          day: newDate.day,
        }),
      }
    case "datetime_floating":
      return {
        kind: "datetime_floating",
        value: et.value.with({
          year: newDate.year,
          month: newDate.month,
          day: newDate.day,
        }),
      }
    case "datetime_utc": {
      // UTC: shift the date in the viewer's zone, then convert back.
      const z = toLocalZoned(et).with({
        year: newDate.year,
        month: newDate.month,
        day: newDate.day,
      })
      return { kind: "datetime_utc", value: z.toInstant() }
    }
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" in the viewer's local zone. Used as a stable key for grouping. */
export function formatDateKey(et: EventDateTime | Date): string {
  if (et instanceof Date) return toLocalDate(dateToPlainDate(et)).toString()
  return toLocalDate(et).toString()
}

// Intl.DateTimeFormat construction is expensive (~5–10x the cost of formatting
// itself). Build the two formatters once and reuse — they're invariant for the
// lifetime of the JS context. Each formats in the viewer's local zone.
const timeFormatters: Partial<Record<TimeFormat, Intl.DateTimeFormat>> = {}
function getTimeFormatter(timeFormat: TimeFormat): Intl.DateTimeFormat {
  let f = timeFormatters[timeFormat]
  if (!f) {
    f = new Intl.DateTimeFormat(timeFormat === "12h" ? "en-US" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: timeFormat === "12h" ? "h12" : "h23",
      timeZone: getLocalTzid(),
    })
    timeFormatters[timeFormat] = f
  }
  return f
}

export function formatTime(et: EventDateTime, timeFormat: TimeFormat): string {
  if (et.kind === "date") return ""
  return getTimeFormatter(timeFormat).format(toInstant(et).epochMilliseconds)
}

/** "Mon, 28 Apr" (or "Mon, 28 Apr 2027" if not the current year). */
export function formatShortDate(et: EventDateTime | Date): string {
  const d = et instanceof Date ? et : toJsDate(et)
  const pattern = getYear(d) !== getYear(new Date()) ? "EEE, d MMM yyyy" : "EEE, d MMM"
  return format(d, pattern)
}

/** "Today" / "Tomorrow" / "Yesterday" / weekday name. */
export function getRelativeDayLabel(et: EventDateTime | Date): string {
  const d = et instanceof Date ? et : toJsDate(et)
  if (isToday(d)) return "Today"
  if (isTomorrow(d)) return "Tomorrow"
  if (isYesterday(d)) return "Yesterday"
  return format(d, "EEEE")
}

// ---------------------------------------------------------------------------
// Day-range helpers (used by week/month grids)
// ---------------------------------------------------------------------------

/** Local-midnight timestamp (ms) of the calendar day this event sits on. */
export function startOfDayMs(et: EventDateTime): number {
  const date = toLocalDate(et)
  // `new Date(y, m-1, d)` constructs midnight in the runtime's local zone,
  // which equals getLocalTzid(). Bypasses the polyfill's BigInt round-trip.
  return new Date(date.year, date.month - 1, date.day).getTime()
}

export const MS_PER_DAY = 86_400_000

/**
 * Inclusive [firstMs, lastMs] range of local midnights this event occupies.
 * DTEND is exclusive, so an end exactly at midnight belongs to the previous day.
 */
export function getEventDayRange(
  start: EventDateTime,
  end: EventDateTime,
): { firstMs: number; lastMs: number } {
  const firstMs = startOfDayMs(start)

  if (start.kind === "date") {
    const endMs = startOfDayMs(end)
    const lastMs = endMs > firstMs ? endMs - MS_PER_DAY : firstMs
    return { firstMs, lastMs }
  }

  const endInstantMs = toInstant(end).epochMilliseconds
  const endDayMs = startOfDayMs(end)
  const lastMs = endInstantMs === endDayMs && endDayMs > firstMs ? endDayMs - MS_PER_DAY : endDayMs
  return { firstMs, lastMs }
}

/**
 * Numeric projections of an event's start/end. Computed once at the
 * EventDateTime → CalendarEvent boundary so the layout hot loops can skip
 * Temporal entirely (BigInt arithmetic, Intl construction, ZonedDateTime
 * allocations) and operate on plain numbers.
 */
export type EventDateInfo = {
  /** Start instant in epoch ms — sort key, format input. */
  startMs: number
  /** Local-midnight ms of the start's day (viewer's zone). */
  firstDayMs: number
  /** Local-midnight ms of the last occupied day, iCal-end-exclusive aware. */
  lastDayMs: number
  /** Local-midnight ms of the end's day (viewer's zone, raw — not iCal-aware). */
  endDayMs: number
  /** Wallclock minutes-of-day at start, in viewer's zone (0 for all-day). */
  startLocalMinutes: number
  /** Wallclock minutes-of-day at end, in viewer's zone (0 for all-day). */
  endLocalMinutes: number
}

export function computeEventDateInfo(start: EventDateTime, end: EventDateTime): EventDateInfo {
  const firstDayMs = startOfDayMs(start)
  const endDayMs = startOfDayMs(end)
  const startMs = toInstant(start).epochMilliseconds

  let lastDayMs: number
  if (start.kind === "date") {
    lastDayMs = endDayMs > firstDayMs ? endDayMs - MS_PER_DAY : firstDayMs
  } else {
    const endInstantMs = toInstant(end).epochMilliseconds
    lastDayMs =
      endInstantMs === endDayMs && endDayMs > firstDayMs ? endDayMs - MS_PER_DAY : endDayMs
  }

  let startLocalMinutes = 0
  let endLocalMinutes = 0
  if (start.kind !== "date") {
    const startZ = toLocalZoned(start)
    const endZ = toLocalZoned(end)
    startLocalMinutes = startZ.hour * 60 + startZ.minute
    endLocalMinutes = endZ.hour * 60 + endZ.minute
  }

  return { startMs, firstDayMs, lastDayMs, endDayMs, startLocalMinutes, endLocalMinutes }
}

/**
 * Ensure an all-day event's [start, end) range is valid: end's day must be at
 * least one day after start's day.
 */
export function normalizeAllDayRange(
  start: EventDateTime,
  end: EventDateTime,
): { start: EventDateTime; end: EventDateTime } {
  const needsBump = startOfDayMs(end) <= startOfDayMs(start)
  return { start, end: needsBump ? addDays(start, 1) : end }
}

/**
 * The viewer-local date keys (YYYY-MM-DD) this event occupies. For timed
 * events that's a single key. For all-day events that's start (inclusive)
 * through end (exclusive, iCal convention) — and at least the start key for
 * degenerate single-day ranges.
 */
export function* enumerateLocalDateKeys(
  start: EventDateTime,
  end: EventDateTime,
): Generator<string> {
  if (!isAllDay(start)) {
    yield formatDateKey(start)
    return
  }

  const startKey = formatDateKey(start)
  const endKey = formatDateKey(end)
  if (startKey >= endKey) {
    yield startKey
    return
  }

  let current: EventDateTime = start
  while (formatDateKey(current) < endKey) {
    yield formatDateKey(current)
    current = addDays(current, 1)
  }
}
