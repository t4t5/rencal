import { Temporal } from "@js-temporal/polyfill"

import type { CalendarEvent } from "@/lib/cal-events"
import { atTime, epochDay, type EventTime } from "@/lib/event-time"
import { isSpanning } from "@/lib/event-utils"

/** DOM id on the active day's cell/column; anchors the new-event popover. */
export const ACTIVE_DAY_EL_ID = "active-day"

/**
 * The end time of `date`'s last timed event, or null if it has none. A new event
 * on that day starts here so it follows the day's existing events. If that end
 * is midnight on the next day, fall back to 08:00 on the selected day instead.
 * Shared by the month "Create event" action and the "add event on active day"
 * shortcut.
 */
export function getLastEventEndTime(
  date: Temporal.PlainDate,
  events: CalendarEvent[],
): EventTime | null {
  const day = epochDay(date)
  const last = events
    .filter((e) => !isSpanning(e) && e.dateInfo.firstDay === day)
    .sort((a, b) => a.dateInfo.startMs - b.dateInfo.startMs)
    .at(-1)

  if (!last) return null
  return last.dateInfo.endDay === day ? last.end : atTime(date, 8)
}
