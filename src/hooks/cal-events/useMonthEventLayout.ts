import { startOfDay } from "date-fns"
import { useMemo } from "react"

import type { Calendar } from "@/rpc/bindings"

import type { CalendarEvent } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { isAllDay } from "@/lib/event-time"
import { daysDiff, MS_PER_DAY } from "@/lib/time"

import type { MonthDay } from "./useMonthGrid"

export type AllDayLaneItem = {
  event: CalendarEvent
  calendarColor: string | null
  startCol: number // 1-based CSS grid-column-start
  endCol: number // 1-based CSS grid-column-end (exclusive)
  lane: number
  isStart: boolean
  isEnd: boolean
}

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

/**
 * All-day events always occupy the all-day lane; timed events only span it if
 * they cross a day boundary.
 */
function isSpanning(event: CalendarEvent): boolean {
  return isAllDay(event.start) || event.dateInfo.lastDayMs - event.dateInfo.firstDayMs >= MS_PER_DAY
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
      const weekStartMs = startOfDay(weekDays[0].date).getTime()
      const weekEndDayMs = startOfDay(weekDays[6].date).getTime()
      const weekExclEndMs = weekEndDayMs + MS_PER_DAY

      const allDayItems: AllDayLaneItem[] = []
      const timedByCol: TimedEventItem[][] = Array.from({ length: 7 }, () => [])

      for (const event of events) {
        const { firstDayMs, lastDayMs } = event.dateInfo
        const calendar = calMap.get(event.calendar_slug)

        if (isSpanning(event)) {
          // Check overlap: event [first, last] vs week [weekStart, weekEndDay]
          if (firstDayMs > weekEndDayMs || lastDayMs < weekStartMs) {
            continue
          }

          // Clamp to week bounds
          const clampedFirstMs = firstDayMs < weekStartMs ? weekStartMs : firstDayMs
          const clampedLastMs = lastDayMs > weekEndDayMs ? weekEndDayMs : lastDayMs

          const startCol = daysDiff(clampedFirstMs, weekStartMs) + 1
          const endCol = daysDiff(clampedLastMs, weekStartMs) + 2

          allDayItems.push({
            event,
            calendarColor: getCalendarColor(calendar),
            startCol,
            endCol,
            lane: 0,
            isStart: firstDayMs >= weekStartMs,
            isEnd: lastDayMs <= weekEndDayMs,
          })
        } else {
          // Single-day timed event
          if (firstDayMs < weekStartMs || firstDayMs >= weekExclEndMs) {
            continue
          }

          const colIndex = daysDiff(firstDayMs, weekStartMs)
          if (colIndex >= 0 && colIndex < 7) {
            timedByCol[colIndex].push({
              event,
              color: getCalendarColor(calendar),
              eventColor: event.color,
            })
          }
        }
      }

      // Sort timed events by start time (using pre-computed sort key)
      for (const col of timedByCol) {
        col.sort((a, b) => a.event.dateInfo.startMs - b.event.dateInfo.startMs)
      }

      // Sort all-day items: wider spans first, then earlier start
      allDayItems.sort((a, b) => {
        const spanDiff = b.endCol - b.startCol - (a.endCol - a.startCol)
        if (spanDiff !== 0) return spanDiff
        return a.startCol - b.startCol
      })

      // Greedy lane assignment
      const laneOccupied: boolean[][] = []
      let maxLane = -1

      for (const item of allDayItems) {
        let lane = 0
        while (true) {
          if (!laneOccupied[lane]) laneOccupied[lane] = Array(7).fill(false) as boolean[]
          let fits = true
          for (let c = item.startCol - 1; c < item.endCol - 1; c++) {
            if (laneOccupied[lane][c]) {
              fits = false
              break
            }
          }
          if (fits) break
          lane++
        }

        if (!laneOccupied[lane]) laneOccupied[lane] = Array(7).fill(false) as boolean[]
        for (let c = item.startCol - 1; c < item.endCol - 1; c++) {
          laneOccupied[lane][c] = true
        }
        item.lane = lane
        maxLane = Math.max(maxLane, lane)
      }

      return { allDayItems, maxLane, timedByCol }
    })
  }, [weeks, events, calendars])
}
