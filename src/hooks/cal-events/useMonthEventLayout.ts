import { addDays, differenceInCalendarDays, isAfter, isBefore, startOfDay } from "date-fns"
import { useMemo } from "react"

import type { Calendar, CalendarEvent } from "@/rpc/bindings"

import type { MonthDay } from "./useMonthGrid"

export type AllDayLaneItem = {
  event: CalendarEvent
  color: string | null
  startCol: number // 1-based CSS grid-column-start
  endCol: number // 1-based CSS grid-column-end (exclusive)
  lane: number
  isStart: boolean
  isEnd: boolean
}

export type TimedEventItem = {
  event: CalendarEvent
  color: string | null
}

export type WeekLayout = {
  allDayItems: AllDayLaneItem[]
  maxLane: number
  timedByCol: TimedEventItem[][] // index 0-6 for each day column
}

function getEventDayRange(event: CalendarEvent): { first: Date; last: Date } {
  const first = startOfDay(event.start)

  if (event.all_day) {
    const end = startOfDay(event.end)
    // All-day events: end is typically exclusive [first, end)
    // Single-day: when start === end, it's just that one day
    if (isBefore(first, end)) {
      return { first, last: addDays(end, -1) }
    }
    return { first, last: first }
  }

  // Timed event
  return { first, last: startOfDay(event.end) }
}

function isSpanningEvent(event: CalendarEvent): boolean {
  const { first, last } = getEventDayRange(event)
  return differenceInCalendarDays(last, first) >= 1 || event.all_day
}

export function useMonthEventLayout(
  weeks: MonthDay[][],
  events: CalendarEvent[],
  calendars: Calendar[],
): WeekLayout[] {
  return useMemo(() => {
    const colorMap = new Map<string, string | null>()
    for (const cal of calendars) {
      colorMap.set(cal.slug, cal.color)
    }

    return weeks.map((weekDays) => {
      const weekStart = startOfDay(weekDays[0].date)
      const weekEndDay = startOfDay(weekDays[6].date)
      const weekExclEnd = addDays(weekEndDay, 1)

      const allDayItems: AllDayLaneItem[] = []
      const timedByCol: TimedEventItem[][] = Array.from({ length: 7 }, () => [])

      for (const event of events) {
        if (isSpanningEvent(event)) {
          const { first, last } = getEventDayRange(event)

          // Check overlap: event [first, last] vs week [weekStart, weekEndDay]
          if (isAfter(first, weekEndDay) || isBefore(last, weekStart)) {
            continue
          }

          // Clamp to week bounds
          const clampedFirst = isBefore(first, weekStart) ? weekStart : first
          const clampedLast = isAfter(last, weekEndDay) ? weekEndDay : last

          const startCol = differenceInCalendarDays(clampedFirst, weekStart) + 1
          const endCol = differenceInCalendarDays(clampedLast, weekStart) + 2

          allDayItems.push({
            event,
            color: colorMap.get(event.calendar_slug) ?? null,
            startCol,
            endCol,
            lane: 0,
            isStart: !isBefore(first, weekStart),
            isEnd: !isAfter(last, weekEndDay),
          })
        } else {
          // Single-day timed event
          const evDay = startOfDay(event.start)
          if (isBefore(evDay, weekStart) || !isBefore(evDay, weekExclEnd)) {
            continue
          }

          const colIndex = differenceInCalendarDays(evDay, weekStart)
          if (colIndex >= 0 && colIndex < 7) {
            timedByCol[colIndex].push({
              event,
              color: colorMap.get(event.calendar_slug) ?? null,
            })
          }
        }
      }

      // Sort timed events by start time
      for (const col of timedByCol) {
        col.sort((a, b) => new Date(a.event.start).getTime() - new Date(b.event.start).getTime())
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
