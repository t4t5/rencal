import { Temporal } from "@js-temporal/polyfill"

import { getCalendarEventsForRange } from "@/lib/api/calendar-events"
import { listCalendars, type Calendar } from "@/lib/api/calendars"
import { getCalendarGroups } from "@/lib/api/settings"
import type { CalendarEvent } from "@/lib/cal-events"
import { getStartRangeForDate } from "@/lib/cal-events-range"
import { getStoredActiveGroup, getVisibleCalendarSlugs } from "@/lib/calendar-groups"
import { today } from "@/lib/event-time"
import { logger } from "@/lib/logger"
import type { DateRange } from "@/lib/types"

export type Preload = {
  initialCalendars?: Calendar[]
  initialEvents?: CalendarEvent[]
  initialDate?: Temporal.PlainDate
  initialRange?: DateRange
}

export async function preloadCalendarData(): Promise<Preload> {
  try {
    const initialDate = today()
    const [initialCalendars, groups] = await Promise.all([listCalendars(), getCalendarGroups()])
    const slugs = getVisibleCalendarSlugs({
      calendars: initialCalendars,
      groups,
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
