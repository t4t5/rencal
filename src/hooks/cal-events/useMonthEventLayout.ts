import { startOfDay } from "date-fns"
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

const MS_PER_DAY = 86_400_000

/** Truncate a timestamp to midnight (start of day) */
function startOfDayMs(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

type EventDayInfo = {
  firstMs: number
  lastMs: number
  spanning: boolean
  startSortKey: number // original start time for sorting timed events
}

function computeEventDayInfo(event: CalendarEvent): EventDayInfo {
  const firstMs = startOfDayMs(event.start)
  const startSortKey = new Date(event.start).getTime()

  if (event.all_day) {
    const endMs = startOfDayMs(event.end)
    // All-day events: end is typically exclusive [first, end)
    // Single-day: when start === end, it's just that one day
    const lastMs = endMs > firstMs ? endMs - MS_PER_DAY : firstMs
    return { firstMs, lastMs, spanning: true, startSortKey }
  }

  // Timed event
  const lastMs = startOfDayMs(event.end)
  const spanning = lastMs - firstMs >= MS_PER_DAY
  return { firstMs, lastMs, spanning, startSortKey }
}

function daysDiff(aMs: number, bMs: number): number {
  return Math.round((aMs - bMs) / MS_PER_DAY)
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

    // Pre-compute day ranges and spanning status once per event
    const eventInfoMap = new Map<string, EventDayInfo>()
    for (const event of events) {
      if (!eventInfoMap.has(event.id)) {
        eventInfoMap.set(event.id, computeEventDayInfo(event))
      }
    }

    return weeks.map((weekDays) => {
      const weekStartMs = startOfDay(weekDays[0].date).getTime()
      const weekEndDayMs = startOfDay(weekDays[6].date).getTime()
      const weekExclEndMs = weekEndDayMs + MS_PER_DAY

      const allDayItems: AllDayLaneItem[] = []
      const timedByCol: TimedEventItem[][] = Array.from({ length: 7 }, () => [])

      for (const event of events) {
        const info = eventInfoMap.get(event.id)!

        if (info.spanning) {
          // Check overlap: event [first, last] vs week [weekStart, weekEndDay]
          if (info.firstMs > weekEndDayMs || info.lastMs < weekStartMs) {
            continue
          }

          // Clamp to week bounds
          const clampedFirstMs = info.firstMs < weekStartMs ? weekStartMs : info.firstMs
          const clampedLastMs = info.lastMs > weekEndDayMs ? weekEndDayMs : info.lastMs

          const startCol = daysDiff(clampedFirstMs, weekStartMs) + 1
          const endCol = daysDiff(clampedLastMs, weekStartMs) + 2

          allDayItems.push({
            event,
            color: colorMap.get(event.calendar_slug) ?? null,
            startCol,
            endCol,
            lane: 0,
            isStart: info.firstMs >= weekStartMs,
            isEnd: info.lastMs <= weekEndDayMs,
          })
        } else {
          // Single-day timed event
          if (info.firstMs < weekStartMs || info.firstMs >= weekExclEndMs) {
            continue
          }

          const colIndex = daysDiff(info.firstMs, weekStartMs)
          if (colIndex >= 0 && colIndex < 7) {
            timedByCol[colIndex].push({
              event,
              color: colorMap.get(event.calendar_slug) ?? null,
            })
          }
        }
      }

      // Sort timed events by start time (using pre-computed sort key)
      for (const col of timedByCol) {
        col.sort(
          (a, b) =>
            eventInfoMap.get(a.event.id)!.startSortKey - eventInfoMap.get(b.event.id)!.startSortKey,
        )
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
