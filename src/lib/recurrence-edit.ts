import { dateInEventZone, withRangeStartDate } from "@/lib/event-time"
import type { EventTime, EventTimeRange } from "@/lib/event-time"

/**
 * Move an edited recurring occurrence back to the master's anchor date.
 * The occurrence supplies the range shape, including whether it is all-day.
 */
export function anchorRangeToRecurringMaster(
  current: EventTimeRange,
  masterStart: EventTime,
): EventTimeRange {
  return withRangeStartDate(current, dateInEventZone(masterStart))
}
