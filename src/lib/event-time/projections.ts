import { Temporal } from "@js-temporal/polyfill"

import { getViewerTzid } from "./local-zone"
import type { EventTime } from "./types"

export function isAllDay(et: EventTime): boolean {
  return et.kind === "date"
}

/**
 * Project an EventTime to a real instant for ordering and layout math.
 *
 * All-day and floating times do not carry a global instant, so they are
 * interpreted in the viewer's zone for this projection. Use this only when a
 * numeric comparison key is needed.
 */
export function instantForOrdering(et: EventTime): Temporal.Instant {
  switch (et.kind) {
    case "date":
      return et.value.toZonedDateTime(getViewerTzid()).toInstant()
    case "datetime_utc":
      return et.value
    case "datetime_floating":
      return et.value.toZonedDateTime(getViewerTzid()).toInstant()
    case "datetime_zoned":
      return et.value.toInstant()
  }
}

/**
 * Convert to a ZonedDateTime in the viewer's local zone. Used for rendering and
 * calculations expressed in the viewer's clock.
 */
export function toViewerZonedDateTime(et: EventTime): Temporal.ZonedDateTime {
  const tzid = getViewerTzid()
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
 * The viewer-local calendar date this event sits on. For all-day events, this
 * is the date itself; for timed events, it is the date in the viewer's zone.
 */
export function dateInViewerZone(et: EventTime): Temporal.PlainDate {
  if (et.kind === "date") return et.value
  return toViewerZonedDateTime(et).toPlainDate()
}

export function isSameDay(a: EventTime, b: EventTime): boolean {
  return dateInViewerZone(a).equals(dateInViewerZone(b))
}
