import { setHours, startOfDay } from "date-fns"

import type { CalendarEvent } from "@/lib/cal-events"
import { fromDate, type EventTime } from "@/lib/event-time"
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
export function getLastEventEndTime(date: Date, events: CalendarEvent[]): EventTime | null {
  const day = startOfDay(date)
  const dayMs = day.getTime()
  const last = events
    .filter((e) => !isSpanning(e) && e.dateInfo.firstDayMs === dayMs)
    .sort((a, b) => a.dateInfo.startMs - b.dateInfo.startMs)
    .at(-1)

  if (!last) return null
  return last.dateInfo.endDayMs === dayMs ? last.end : fromDate(setHours(day, 8))
}
