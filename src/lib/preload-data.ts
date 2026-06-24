import { rpc } from "@/rpc"
import type { Calendar } from "@/rpc/bindings"

import type { CalendarEvent } from "@/lib/cal-events"
import { getCalendarEventsForRange, getStartRangeForDate } from "@/lib/cal-events-range"
import {
  getStoredActiveGroup,
  getVisibleCalendarSlugs,
  normalizeCalendarGroups,
} from "@/lib/calendar-groups"
import { logger } from "@/lib/logger"
import type { DateRange } from "@/lib/types"

export type Preload = {
  initialCalendars?: Calendar[]
  initialEvents?: CalendarEvent[]
  initialDate?: Date
  initialRange?: DateRange
}

export async function preloadCalendarData(): Promise<Preload> {
  try {
    const initialDate = new Date()
    const [initialCalendars, groupsResult] = await Promise.all([
      rpc.caldir.list_calendars(),
      rpc.config.get_groups(),
    ])
    const slugs = getVisibleCalendarSlugs({
      calendars: initialCalendars,
      groups: normalizeCalendarGroups(groupsResult),
      activeGroup: getStoredActiveGroup(localStorage),
    })

    if (slugs.length === 0) {
      return { initialCalendars, initialEvents: [], initialDate }
    }

    const initialRange = getStartRangeForDate(initialDate)
    const initialEvents = await getCalendarEventsForRange(
      slugs,
      initialRange.start,
      initialRange.end,
    )
    return { initialCalendars, initialEvents, initialDate, initialRange }
  } catch (err) {
    logger.error("Preload failed, falling back to lazy load", err)
    return {}
  }
}
