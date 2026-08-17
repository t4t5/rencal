import { Temporal } from "@js-temporal/polyfill"

import type { CalendarEvent } from "./cal-events"
import { getViewerTzid } from "./event-time"
import { withNearestOccurrence } from "./rrule-utils"

/** Normalize recurring masters, then rank every result by its displayed date. */
export function prepareSearchResults(
  events: CalendarEvent[],
  nowMs = Temporal.Now.instant().epochMilliseconds,
): CalendarEvent[] {
  const now = Temporal.Instant.fromEpochMilliseconds(nowMs)
    .toZonedDateTimeISO(getViewerTzid())
    .toPlainDateTime()

  return events
    .map((event) => withNearestOccurrence(event, now))
    .sort((a, b) => Math.abs(a.dateInfo.startMs - nowMs) - Math.abs(b.dateInfo.startMs - nowMs))
}
