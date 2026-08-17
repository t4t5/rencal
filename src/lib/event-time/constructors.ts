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
 * DOM date/time inputs). Those Dates carry the intended wallclock in their
 * local components, so interpret the components in the given zone, or the
 * viewer's zone. Interpreting the instant instead would shift the wallclock
 * whenever the webview's zone (fixed at launch) and the viewer's current zone
 * diverge after an OS timezone change.
 */
export function fromDate(d: Date, tzid: string = getLocalTzid()): EventTime {
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

/** Bridge: take a JS Date's local calendar date and produce an all-day EventTime. */
export function allDayFromLocalDate(d: Date): EventTime {
  return plainDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** Bridge: viewer-zone wallclock "now", materialized in a local-components Date. */
export function nowLocalDate(): Date {
  const z = Temporal.Now.zonedDateTimeISO(getLocalTzid())
  return new Date(z.year, z.month - 1, z.day, z.hour, z.minute, z.second, z.millisecond)
}

/** Bridge: the viewer-zone calendar date "today" as a local-midnight day-key Date. */
export function todayLocalDate(): Date {
  const z = Temporal.Now.zonedDateTimeISO(getLocalTzid())
  return new Date(z.year, z.month - 1, z.day)
}
