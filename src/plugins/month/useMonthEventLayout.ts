import { useMemo } from "react"

import {
  type AllDaySpan,
  assignAllDayLanes,
  type CalendarEvent,
  clipSpanToRange,
  epochDay,
  isAllDay,
} from "@/sdk"

import type { MonthDay } from "./useMonthGrid"

export type AllDayLaneItem = AllDaySpan & {
  event: CalendarEvent
  lane: number
}

export type WeekLayout = {
  allDayItems: AllDayLaneItem[]
  maxLane: number
  timedByCol: CalendarEvent[][] // index 0-6 for each day column
}

/** All-day events always sit in the lanes; timed events only if they cross a day boundary. */
export function isSpanning(event: CalendarEvent): boolean {
  return isAllDay(event.start) || !event.lastDay.equals(event.firstDay)
}

export function useMonthEventLayout(
  weeks: MonthDay[][],
  events: readonly CalendarEvent[],
): WeekLayout[] {
  return useMemo(() => {
    return weeks.map((weekDays) => {
      const weekStartDay = epochDay(weekDays[0].date)
      const weekEndDay = epochDay(weekDays[6].date)

      const allDayItems: AllDayLaneItem[] = []
      const timedByCol: CalendarEvent[][] = Array.from({ length: 7 }, () => [])

      for (const event of events) {
        const firstDay = epochDay(event.firstDay)

        if (isSpanning(event)) {
          const span = clipSpanToRange(firstDay, epochDay(event.lastDay), weekStartDay, weekEndDay)
          if (span) allDayItems.push({ ...span, event, lane: 0 })
        } else {
          // Single-day timed event
          const colIndex = firstDay - weekStartDay
          if (colIndex >= 0 && colIndex < 7) timedByCol[colIndex].push(event)
        }
      }

      // A drag preview is appended after the sorted events.
      for (const col of timedByCol) {
        col.sort((a, b) => a.startMinutes - b.startMinutes)
      }

      const maxLane = assignAllDayLanes(allDayItems, 7)

      return { allDayItems, maxLane, timedByCol }
    })
  }, [weeks, events])
}
