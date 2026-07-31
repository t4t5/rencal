import type { CalendarEvent } from "./cal-events"
import { withNearestOccurrence } from "./rrule-utils"

/** Normalize recurring masters, then rank every result by its displayed date. */
export function prepareSearchResults(events: CalendarEvent[], now = new Date()): CalendarEvent[] {
  const nowMs = now.getTime()

  return events
    .map((event) => withNearestOccurrence(event, now))
    .sort((a, b) => Math.abs(a.dateInfo.startMs - nowMs) - Math.abs(b.dateInfo.startMs - nowMs))
}
