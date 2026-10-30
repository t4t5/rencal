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

/**
 * Lays out the events of the consecutive `weeks`. Each event is visited once and placed in
 * the weeks it covers: reading a Temporal date's fields is slow enough that doing it per
 * event per week stalled scrolling once a few months were loaded.
 */
export function useMonthEventLayout(
  weeks: MonthDay[][],
  events: readonly CalendarEvent[],
): WeekLayout[] {
  return useMemo(() => {
    const layouts: WeekLayout[] = weeks.map(() => ({
      allDayItems: [],
      maxLane: -1,
      timedByCol: Array.from({ length: 7 }, () => []),
    }))
    if (layouts.length === 0) return layouts

    const rangeFirstDay = epochDay(weeks[0][0].date)
    const rangeDays = layouts.length * 7

    for (const event of events) {
      const firstDay = epochDay(event.firstDay)

      if (isSpanning(event)) {
        const lastDay = epochDay(event.lastDay)
        const fromWeek = Math.max(0, Math.floor((firstDay - rangeFirstDay) / 7))
        const toWeek = Math.min(layouts.length - 1, Math.floor((lastDay - rangeFirstDay) / 7))
        for (let week = fromWeek; week <= toWeek; week++) {
          const weekFirstDay = rangeFirstDay + week * 7
          const span = clipSpanToRange(firstDay, lastDay, weekFirstDay, weekFirstDay + 6)
          if (span) layouts[week].allDayItems.push({ ...span, event, lane: 0 })
        }
      } else {
        // Single-day timed event
        const offset = firstDay - rangeFirstDay
        if (offset >= 0 && offset < rangeDays) {
          layouts[Math.floor(offset / 7)].timedByCol[offset % 7].push(event)
        }
      }
    }

    for (const layout of layouts) {
      // A drag preview is appended after the sorted events.
      for (const col of layout.timedByCol) {
        col.sort((a, b) => a.startMinutes - b.startMinutes)
      }
      layout.maxLane = assignAllDayLanes(layout.allDayItems, 7)
    }

    return layouts
  }, [weeks, events])
}
