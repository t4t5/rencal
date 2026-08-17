import { useMemo } from "react"

import type { Calendar } from "@/rpc/bindings"

import type { CalendarEvent } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { epochDay } from "@/lib/event-time"
import { isSpanning } from "@/lib/event-utils"

import { assignAllDayLanes, buildAllDaySpan, type AllDayLaneItem } from "./all-day-lanes"
import type { MonthDay } from "./useMonthGrid"

export type TimedEventItem = {
  event: CalendarEvent
  color: string | null
  eventColor: string | null
}

export type WeekLayout = {
  allDayItems: AllDayLaneItem[]
  maxLane: number
  timedByCol: TimedEventItem[][] // index 0-6 for each day column
}

export function useMonthEventLayout(
  weeks: MonthDay[][],
  events: CalendarEvent[],
  calendars: Calendar[],
): WeekLayout[] {
  return useMemo(() => {
    const calMap = new Map<string, Calendar>()

    for (const cal of calendars) {
      calMap.set(cal.slug, cal)
    }

    return weeks.map((weekDays) => {
      const weekStartDay = epochDay(weekDays[0].date)
      const weekEndDay = epochDay(weekDays[6].date)
      const weekExclEndDay = weekEndDay + 1

      const allDayItems: AllDayLaneItem[] = []
      const timedByCol: TimedEventItem[][] = Array.from({ length: 7 }, () => [])

      for (const event of events) {
        const { firstDay } = event.dateInfo
        const calendar = calMap.get(event.calendar_slug)
        const calendarColor = getCalendarColor(calendar)

        if (isSpanning(event)) {
          const item = buildAllDaySpan(event, weekStartDay, weekEndDay, calendarColor)
          if (item) allDayItems.push(item)
        } else {
          // Single-day timed event
          if (firstDay < weekStartDay || firstDay >= weekExclEndDay) {
            continue
          }

          const colIndex = firstDay - weekStartDay
          if (colIndex >= 0 && colIndex < 7) {
            timedByCol[colIndex].push({
              event,
              color: calendarColor,
              eventColor: event.color,
            })
          }
        }
      }

      // Sort timed events by start time (using pre-computed sort key)
      for (const col of timedByCol) {
        col.sort((a, b) => a.event.dateInfo.startMs - b.event.dateInfo.startMs)
      }

      const maxLane = assignAllDayLanes(allDayItems, 7)

      return { allDayItems, maxLane, timedByCol }
    })
  }, [weeks, events, calendars])
}
