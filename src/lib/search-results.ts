import { Temporal } from "@js-temporal/polyfill"

import type { CalendarEvent } from "./cal-events"
import { getViewerTzid } from "./event-time"
import { withNearestOccurrence } from "./rrule-utils"

/** Normalize recurring masters, then rank every result by its displayed date. */
export function prepareSearchResults(
  events: CalendarEvent[],
  now: Temporal.Instant = Temporal.Now.instant(),
): CalendarEvent[] {
  const nowMs = now.epochMilliseconds
  const viewerNow = now.toZonedDateTimeISO(getViewerTzid()).toPlainDateTime()

  return events
    .map((event) => withNearestOccurrence(event, viewerNow))
    .sort((a, b) => Math.abs(a.dateInfo.startMs - nowMs) - Math.abs(b.dateInfo.startMs - nowMs))
}
