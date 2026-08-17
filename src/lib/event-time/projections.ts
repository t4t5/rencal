import { Temporal } from "@js-temporal/polyfill"

import { getLocalTzid } from "./local-zone"
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
      return et.value.toZonedDateTime(getLocalTzid()).toInstant()
    case "datetime_utc":
      return et.value
    case "datetime_floating":
      return et.value.toZonedDateTime(getLocalTzid()).toInstant()
    case "datetime_zoned":
      return et.value.toInstant()
  }
}

/**
 * Convert to a ZonedDateTime in the viewer's local zone. Used for rendering and
 * calculations expressed in the viewer's clock.
 */
export function toViewerZonedDateTime(et: EventTime): Temporal.ZonedDateTime {
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
 * The viewer-local calendar date this event sits on. For all-day events, this
 * is the date itself; for timed events, it is the date in the viewer's zone.
 */
export function dateInViewerZone(et: EventTime): Temporal.PlainDate {
  if (et.kind === "date") return et.value
  return toViewerZonedDateTime(et).toPlainDate()
}

/**
 * A JS Date snapshot for DOM and third-party APIs. This is intentionally named
 * as an interop projection because all-day and floating values do not have an
 * inherent UTC instant.
 */
export function toInteropDate(et: EventTime): Date {
  return new Date(instantForOrdering(et).epochMilliseconds)
}

/**
 * The viewer-local calendar day as a local-midnight day-key Date, for date-fns
 * date formatting and day-based navigation. Formatting the raw interop instant
 * instead would render in the webview's zone, which is fixed at launch and
 * goes stale after an OS timezone change.
 */
export function localDateInViewerZone(et: EventTime): Date {
  const d = dateInViewerZone(et)
  return new Date(d.year, d.month - 1, d.day)
}

export function isSameDay(a: EventTime, b: EventTime): boolean {
  return dateInViewerZone(a).equals(dateInViewerZone(b))
}
