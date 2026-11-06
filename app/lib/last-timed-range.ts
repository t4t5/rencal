import { computed } from "nsh"

import { type EventTimeRange, isAllDay } from "@/lib/event-time"

/** The last range with times, so turning all-day off can restore it. */
export const lastTimedRange = (range: () => EventTimeRange) =>
  computed<EventTimeRange | null>((previous) => {
    const current = range()
    return isAllDay(current.start) ? (previous ?? null) : current
  })
