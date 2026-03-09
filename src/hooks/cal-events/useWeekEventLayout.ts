import { startOfDay } from "date-fns"
import { useMemo } from "react"

import type { Calendar, CalendarEvent } from "@/rpc/bindings"

import type { AllDayLaneItem } from "./useMonthEventLayout"
import type { MonthDay } from "./useMonthGrid"

export const HOUR_HEIGHT = 60

export type WeekTimedEventLayout = {
  event: CalendarEvent
  color: string | null
  top: number
  height: number
  column: number
  totalColumns: number
}

export type WeekLayout = {
  allDayItems: AllDayLaneItem[]
  maxAllDayLane: number
  timedByCol: WeekTimedEventLayout[][]
}

const MS_PER_DAY = 86_400_000

function startOfDayMs(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : new Date(date.getTime())
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function daysDiff(aMs: number, bMs: number): number {
  return Math.round((aMs - bMs) / MS_PER_DAY)
}

function computeTimedPosition(event: CalendarEvent): { top: number; height: number } {
  const start = new Date(event.start)
  const end = new Date(event.end)
  const startMinutes = start.getHours() * 60 + start.getMinutes()
  const endMinutes = end.getHours() * 60 + end.getMinutes()

  // If event spans midnight, clamp end to end of day
  const startDay = startOfDayMs(start)
  const endDay = startOfDayMs(end)
  const durationMinutes = endDay > startDay ? 24 * 60 - startMinutes : endMinutes - startMinutes

  const top = (startMinutes / 60) * HOUR_HEIGHT
  const height = Math.max((durationMinutes / 60) * HOUR_HEIGHT, 15)

  return { top, height }
}

/** Assign overlap columns using a greedy sweep-line algorithm */
function assignOverlapColumns(events: WeekTimedEventLayout[]) {
  if (events.length === 0) return

  // Sort by top, then by height descending
  events.sort((a, b) => a.top - b.top || b.height - a.height)

  // Build collision groups: events that transitively overlap
  const groups: WeekTimedEventLayout[][] = []
  let currentGroup: WeekTimedEventLayout[] = [events[0]]
  let groupEnd = events[0].top + events[0].height

  for (let i = 1; i < events.length; i++) {
    const ev = events[i]
    if (ev.top < groupEnd) {
      // Overlaps with current group
      currentGroup.push(ev)
      groupEnd = Math.max(groupEnd, ev.top + ev.height)
    } else {
      groups.push(currentGroup)
      currentGroup = [ev]
      groupEnd = ev.top + ev.height
    }
  }
  groups.push(currentGroup)

  // For each group, assign columns
  for (const group of groups) {
    const columns: number[] = [] // end positions per column
    for (const ev of group) {
      let col = 0
      while (col < columns.length && columns[col] > ev.top) {
        col++
      }
      ev.column = col
      columns[col] = ev.top + ev.height

      // Extend columns array if needed
      if (col >= columns.length) {
        columns.push(ev.top + ev.height)
      }
    }
    const totalColumns = columns.length
    for (const ev of group) {
      ev.totalColumns = totalColumns
    }
  }
}

export function useWeekEventLayout(
  weekDays: MonthDay[],
  events: CalendarEvent[],
  calendars: Calendar[],
): WeekLayout {
  return useMemo(() => {
    const colorMap = new Map<string, string | null>()
    for (const cal of calendars) {
      colorMap.set(cal.slug, cal.color)
    }

    const weekStartMs = startOfDay(weekDays[0].date).getTime()
    const weekEndDayMs = startOfDay(weekDays[6].date).getTime()
    const weekExclEndMs = weekEndDayMs + MS_PER_DAY

    const allDayItems: AllDayLaneItem[] = []
    const timedByCol: WeekTimedEventLayout[][] = Array.from({ length: 7 }, () => [])

    for (const event of events) {
      const firstMs = startOfDayMs(event.start)
      const color = colorMap.get(event.calendar_slug) ?? null

      if (event.all_day) {
        const endMs = startOfDayMs(event.end)
        const lastMs = endMs > firstMs ? endMs - MS_PER_DAY : firstMs

        // Check overlap with week
        if (firstMs > weekEndDayMs || lastMs < weekStartMs) continue

        const clampedFirstMs = Math.max(firstMs, weekStartMs)
        const clampedLastMs = Math.min(lastMs, weekEndDayMs)

        const startCol = daysDiff(clampedFirstMs, weekStartMs) + 1
        const endCol = daysDiff(clampedLastMs, weekStartMs) + 2

        allDayItems.push({
          event,
          color,
          startCol,
          endCol,
          lane: 0,
          isStart: firstMs >= weekStartMs,
          isEnd: lastMs <= weekEndDayMs,
        })
      } else {
        // Timed event — check if it spans multiple days
        const lastMs = startOfDayMs(event.end)
        const spanning = lastMs - firstMs >= MS_PER_DAY

        if (spanning) {
          // Multi-day timed events go to all-day bar
          if (firstMs > weekEndDayMs || lastMs < weekStartMs) continue

          const clampedFirstMs = Math.max(firstMs, weekStartMs)
          const clampedLastMs = Math.min(lastMs, weekEndDayMs)

          const startCol = daysDiff(clampedFirstMs, weekStartMs) + 1
          const endCol = daysDiff(clampedLastMs, weekStartMs) + 2

          allDayItems.push({
            event,
            color,
            startCol,
            endCol,
            lane: 0,
            isStart: firstMs >= weekStartMs,
            isEnd: lastMs <= weekEndDayMs,
          })
        } else {
          // Single-day timed event
          if (firstMs < weekStartMs || firstMs >= weekExclEndMs) continue

          const colIndex = daysDiff(firstMs, weekStartMs)
          if (colIndex >= 0 && colIndex < 7) {
            const { top, height } = computeTimedPosition(event)
            timedByCol[colIndex].push({
              event,
              color,
              top,
              height,
              column: 0,
              totalColumns: 1,
            })
          }
        }
      }
    }

    // Assign overlap columns for each day
    for (const col of timedByCol) {
      assignOverlapColumns(col)
    }

    // Sort and assign lanes for all-day items
    allDayItems.sort((a, b) => {
      const spanDiff = b.endCol - b.startCol - (a.endCol - a.startCol)
      if (spanDiff !== 0) return spanDiff
      return a.startCol - b.startCol
    })

    const laneOccupied: boolean[][] = []
    let maxAllDayLane = -1

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
      maxAllDayLane = Math.max(maxAllDayLane, lane)
    }

    return { allDayItems, maxAllDayLane, timedByCol }
  }, [weekDays, events, calendars])
}
