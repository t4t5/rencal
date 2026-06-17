import { getHours, startOfDay, startOfHour } from "date-fns"

import type { CalendarEvent } from "@/lib/cal-events"
import { toViewerZonedDateTime } from "@/lib/event-time"
import { isSpanning } from "@/lib/event-utils"

/** DOM id on the active day's cell/column; anchors the new-event popover. */
export const ACTIVE_DAY_EL_ID = "active-day"

/**
 * Start hour for a new event on `date`: the end hour of that day's last timed
 * event, or the current hour if it has none. Shared by the month "Create event"
 * action and the "add event on active day" shortcut so both stay in sync.
 */
export function getDayDraftStartHour(date: Date, events: CalendarEvent[]): number {
  const dayMs = startOfDay(date).getTime()
  const last = events
    .filter((e) => !isSpanning(e) && e.dateInfo.firstDayMs === dayMs)
    .sort((a, b) => a.dateInfo.startMs - b.dateInfo.startMs)
    .at(-1)
  return last ? toViewerZonedDateTime(last.end).hour : getHours(startOfHour(new Date()))
}
