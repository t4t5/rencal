import { Temporal } from "@js-temporal/polyfill"

import { getViewerTzid } from "./local-zone"
import type { EventTime } from "./types"

export function allDayDate(value: Temporal.PlainDate): EventTime {
  return { kind: "date", value }
}

/** The current calendar day in the viewer's timezone. */
export function today(): Temporal.PlainDate {
  return Temporal.Now.plainDateISO(getViewerTzid())
}

/** A timed event on a calendar day in the viewer's timezone. */
export function atTime(date: Temporal.PlainDate, hour: number, minute = 0): EventTime {
  return {
    kind: "datetime_zoned",
    value: date.toPlainDateTime({ hour, minute }).toZonedDateTime(getViewerTzid()),
  }
}

/** A ZonedDateTime "now" in the viewer's local zone. */
export function nowZoned(): EventTime {
  return {
    kind: "datetime_zoned",
    value: Temporal.Now.zonedDateTimeISO(getViewerTzid()),
  }
}

/**
 * Boundary bridge for libraries that produce a JS `Date` (chrono-node and
 * rrule.js). Those Dates carry the intended wallclock in their
 * local components, so interpret the components in the given zone, or the
 * viewer's zone. Interpreting the instant instead would shift the wallclock
 * whenever the webview's zone (fixed at launch) and the viewer's current zone
 * diverge after an OS timezone change.
 */
export function fromDate(d: Date, tzid: string = getViewerTzid()): EventTime {
  const wallclock = new Temporal.PlainDateTime(
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  )
  return {
    kind: "datetime_zoned",
    value: wallclock.toZonedDateTime(tzid),
  }
}
