import { Temporal } from "@js-temporal/polyfill"

import { getLocalTzid } from "./local-zone"
import type { EventTime } from "./types"

export function allDayDate(value: Temporal.PlainDate): EventTime {
  return { kind: "date", value }
}

/** All-day event at the given calendar date. */
export function plainDate(year: number, month: number, day: number): EventTime {
  return allDayDate(new Temporal.PlainDate(year, month, day))
}

/** A ZonedDateTime "now" in the viewer's local zone. */
export function nowZoned(): EventTime {
  return {
    kind: "datetime_zoned",
    value: Temporal.Now.zonedDateTimeISO(getLocalTzid()),
  }
}

/**
 * Bridge for libraries that produce a JS `Date` (chrono-node, drag offsets,
 * DOM date/time inputs). Interprets the Date's instant in the given zone, or
 * the viewer's zone, and produces a zoned EventTime.
 */
export function fromDate(d: Date, tzid: string = getLocalTzid()): EventTime {
  const instant = Temporal.Instant.fromEpochMilliseconds(d.getTime())
  return {
    kind: "datetime_zoned",
    value: instant.toZonedDateTimeISO(tzid),
  }
}

/** Bridge: take a JS Date's local calendar date and produce an all-day EventTime. */
export function allDayFromLocalDate(d: Date): EventTime {
  return plainDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}
