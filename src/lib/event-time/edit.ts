import { Temporal } from "@js-temporal/polyfill"

import { allDayDate } from "./constructors"
import { getLocalTzid } from "./local-zone"
import { dateInViewerZone, toViewerZonedDateTime } from "./projections"
import type { EventTime } from "./types"

/**
 * Promote an all-day date to a timed event in the viewer's zone, anchored at
 * the start of that date. Used when toggling all-day off.
 */
export function toTimedAtStartOfDay(et: EventTime): EventTime {
  if (et.kind !== "date") return et
  return {
    kind: "datetime_zoned",
    value: et.value.toZonedDateTime(getLocalTzid()),
  }
}

/**
 * Demote a timed event to an all-day date, taking the calendar date in the
 * viewer's local zone. Used when toggling all-day on.
 */
export function toAllDay(et: EventTime): EventTime {
  if (et.kind === "date") return et
  return allDayDate(dateInViewerZone(et))
}

export function addMinutes(et: EventTime, minutes: number): EventTime {
  switch (et.kind) {
    case "date":
      return { kind: "date", value: et.value.add({ days: Math.round(minutes / 1440) }) }
    case "datetime_utc":
      return { kind: "datetime_utc", value: et.value.add({ minutes }) }
    case "datetime_floating":
      return { kind: "datetime_floating", value: et.value.add({ minutes }) }
    case "datetime_zoned":
      return { kind: "datetime_zoned", value: et.value.add({ minutes }) }
  }
}

export function addDays(et: EventTime, days: number): EventTime {
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
 * The PlainDate of the event in its own zone, not the viewer's. Used by
 * editing UI so a Stockholm viewer sees an LA-zoned event's LA date.
 */
export function dateInEventZone(et: EventTime): Temporal.PlainDate {
  switch (et.kind) {
    case "date":
      return et.value
    case "datetime_zoned":
      return et.value.toPlainDate()
    case "datetime_floating":
      return et.value.toPlainDate()
    case "datetime_utc":
      return dateInViewerZone(et)
  }
}

/**
 * The wallclock hour/minute in the event's own zone. All-day events return
 * 00:00 because there is no clock component.
 */
export function wallclockTime(et: EventTime): { hour: number; minute: number } {
  switch (et.kind) {
    case "date":
      return { hour: 0, minute: 0 }
    case "datetime_zoned":
      return { hour: et.value.hour, minute: et.value.minute }
    case "datetime_floating":
      return { hour: et.value.hour, minute: et.value.minute }
    case "datetime_utc": {
      const z = toViewerZonedDateTime(et)
      return { hour: z.hour, minute: z.minute }
    }
  }
}

/**
 * Replace the wallclock hour/minute in the event's own zone, preserving zone
 * identity. For all-day events this is a no-op.
 */
export function withWallclockTime(et: EventTime, hour: number, minute: number): EventTime {
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
      const z = toViewerZonedDateTime(et).with({ hour, minute, second: 0, millisecond: 0 })
      return { kind: "datetime_utc", value: z.toInstant() }
    }
  }
}

/**
 * Replace the calendar date, preserving the wallclock and zone. For all-day
 * events this swaps the date directly.
 */
export function withEventDate(et: EventTime, newDate: Temporal.PlainDate): EventTime {
  switch (et.kind) {
    case "date":
      return allDayDate(newDate)
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
      const z = toViewerZonedDateTime(et).with({
        year: newDate.year,
        month: newDate.month,
        day: newDate.day,
      })
      return { kind: "datetime_utc", value: z.toInstant() }
    }
  }
}
