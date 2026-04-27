/*
 * Datetime primitive for rencal events.
 *
 * Mirrors the four-variant EventTime in caldir-core (date, datetime_utc,
 * datetime_floating, datetime_zoned). Wall-clock + IANA zone is the source of
 * truth for zoned events — the UTC instant is computed when needed for
 * comparison or display in another zone.
 *
 * All datetime parsing/formatting goes through this module. App code should
 * never call .toISOString(), .toLocaleString(), or `new Date(string)` on event
 * times.
 */
import { Temporal } from "@js-temporal/polyfill"

import type { TimeFormat, WireEventTime } from "@/rpc/bindings"

export type EventDateTime =
  | { kind: "date"; value: Temporal.PlainDate }
  | { kind: "datetime_utc"; value: Temporal.Instant }
  | { kind: "datetime_floating"; value: Temporal.PlainDateTime }
  | { kind: "datetime_zoned"; value: Temporal.ZonedDateTime }

// ---------------------------------------------------------------------------
// Local zone
// ---------------------------------------------------------------------------

/** The viewer's IANA timezone (e.g. "Europe/Stockholm"). */
export function getLocalTzid(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
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
 * The user, viewing the event in their local zone, picked a new wall-clock
 * time. Preserve the event's zone identity: re-anchor the new instant in the
 * event's original zone (matching Google Calendar's edit semantics).
 *
 * For all-day events this swaps in a new calendar date.
 */
export function editTime(et: EventDateTime, newViewerLocalDate: Date): EventDateTime {
  if (et.kind === "date") {
    return {
      kind: "date",
      value: Temporal.PlainDate.from({
        year: newViewerLocalDate.getFullYear(),
        month: newViewerLocalDate.getMonth() + 1,
        day: newViewerLocalDate.getDate(),
      }),
    }
  }

  const newInstant = Temporal.Instant.fromEpochMilliseconds(newViewerLocalDate.getTime())

  switch (et.kind) {
    case "datetime_utc":
      return { kind: "datetime_utc", value: newInstant }
    case "datetime_floating":
      // Floating: reinterpret the viewer's wallclock as the floating wallclock.
      return {
        kind: "datetime_floating",
        value: newInstant.toZonedDateTimeISO(getLocalTzid()).toPlainDateTime(),
      }
    case "datetime_zoned":
      return {
        kind: "datetime_zoned",
        value: newInstant.toZonedDateTimeISO(et.value.timeZoneId),
      }
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" in the viewer's local zone. Used as a stable key for grouping. */
export function formatDateKey(et: EventDateTime): string {
  return toLocalDate(et).toString()
}

export function formatTime(et: EventDateTime, timeFormat: TimeFormat): string {
  if (et.kind === "date") return ""
  const z = toLocalZoned(et)
  if (timeFormat === "12h") {
    return z.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  }
  // 24h: HH:mm with leading zero.
  const h = String(z.hour).padStart(2, "0")
  const m = String(z.minute).padStart(2, "0")
  return `${h}:${m}`
}

// ---------------------------------------------------------------------------
// Day-range helpers (used by week/month grids)
// ---------------------------------------------------------------------------

/** Local-midnight timestamp (ms) of the calendar day this event sits on. */
export function startOfDayMs(et: EventDateTime): number {
  const date = toLocalDate(et)
  // Reify in the viewer's local zone so .epochMilliseconds = local midnight.
  return date.toZonedDateTime(getLocalTzid()).epochMilliseconds
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
