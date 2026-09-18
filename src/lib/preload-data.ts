import { Temporal } from "@js-temporal/polyfill"

import { api, type Calendar } from "@/lib/api"
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
    const [initialCalendars, groups] = await Promise.all([
      api.calendars.list(),
      api.settings.getCalendarGroups(),
    ])
    const slugs = getVisibleCalendarSlugs({
      calendars: initialCalendars,
      groups,
      activeGroup: getStoredActiveGroup(localStorage),
    })

    if (slugs.length === 0) {
      return { initialCalendars, initialEvents: [], initialDate }
    }

    const initialRange = getStartRangeForDate(initialDate)
    const initialEvents = await api.events.list({
      calendar_slugs: slugs,
      range: initialRange,
    })
    return { initialCalendars, initialEvents, initialDate, initialRange }
  } catch (err) {
    logger.error("Preload failed, falling back to lazy load", err)
    return {}
  }
}
