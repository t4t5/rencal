import { startOfDay } from "date-fns"
import { useMemo } from "react"

import type { Calendar } from "@/rpc/bindings"

import type { CalendarEvent } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { isAllDay, MS_PER_DAY } from "@/lib/event-time"

import type { AllDayLaneItem } from "./useMonthEventLayout"
import type { MonthDay } from "./useMonthGrid"

/** Total minutes in a day */
const DAY_MINUTES = 24 * 60

export type WeekEventDisplayMode = "compact" | "standard" | "expanded"

export type WeekTimedEventLayout = {
  event: CalendarEvent
  color: string | null
  eventColor: string | null
  top: number
  height: number
  column: number
  totalColumns: number
  durationMinutes: number
  displayMode: WeekEventDisplayMode
}

export type DayRangeLayout = {
  allDayItems: AllDayLaneItem[]
  maxAllDayLane: number
  timedByDay: Map<string, WeekTimedEventLayout[]>
}

function daysDiff(aMs: number, bMs: number): number {
  return Math.round((aMs - bMs) / MS_PER_DAY)
}

/** Returns top and height as percentages (0–100) of the visible range */
function computeTimedPosition(
  event: CalendarEvent,
  rangeStartMin: number,
  rangeMinutes: number,
): { top: number; height: number; durationMinutes: number } {
  // Pre-computed at the EventTime → CalendarEvent boundary; expressed in
  // the viewer's local zone (matches Google/Apple calendar UIs).
  const { startLocalMinutes, endLocalMinutes, firstDayMs, endDayMs } = event.dateInfo

  // If event spans midnight, clamp end to end of day
  const durationMinutes =
    endDayMs > firstDayMs ? DAY_MINUTES - startLocalMinutes : endLocalMinutes - startLocalMinutes

  const top = ((startLocalMinutes - rangeStartMin) / rangeMinutes) * 100
  const height = (durationMinutes / rangeMinutes) * 100

  return { top, height, durationMinutes }
}

function displayModeFor(durationMinutes: number): WeekEventDisplayMode {
  if (durationMinutes < 30) return "compact"
  if (durationMinutes < 60) return "standard"
  return "expanded"
}

/** Tolerance for float precision when comparing positions derived from minute-based math */
const OVERLAP_EPS = 1e-5

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
    if (ev.top + OVERLAP_EPS < groupEnd) {
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
      while (col < columns.length && columns[col] > ev.top + OVERLAP_EPS) {
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

export function useDayRangeLayout(
  days: MonthDay[],
  events: CalendarEvent[],
  calendars: Calendar[],
): DayRangeLayout {
  return useMemo(() => {
    const calMap = new Map<string, Calendar>()
    for (const cal of calendars) {
      calMap.set(cal.slug, cal)
    }

    const N = days.length
    if (N === 0) {
      return { allDayItems: [], maxAllDayLane: -1, timedByDay: new Map() }
    }

    const rangeStartMs = startOfDay(days[0].date).getTime()
    const rangeLastDayMs = startOfDay(days[N - 1].date).getTime()
    const rangeExclEndMs = rangeLastDayMs + MS_PER_DAY

    const rangeStartMin = 0
    const rangeMinutes = DAY_MINUTES

    const allDayItems: AllDayLaneItem[] = []
    const timedByDay = new Map<string, WeekTimedEventLayout[]>()
    for (const day of days) {
      timedByDay.set(day.dateKey, [])
    }

    for (const event of events) {
      const { firstDayMs: firstMs, lastDayMs: lastMs } = event.dateInfo
      const color = getCalendarColor(calMap.get(event.calendar_slug))
      const eventColor = event.color

      if (isAllDay(event.start)) {
        // Check overlap with range
        if (firstMs > rangeLastDayMs || lastMs < rangeStartMs) continue

        const clampedFirstMs = Math.max(firstMs, rangeStartMs)
        const clampedLastMs = Math.min(lastMs, rangeLastDayMs)

        const startCol = daysDiff(clampedFirstMs, rangeStartMs) + 1
        const endCol = daysDiff(clampedLastMs, rangeStartMs) + 2

        allDayItems.push({
          event,
          color,
          eventColor,
          startCol,
          endCol,
          lane: 0,
          isStart: firstMs >= rangeStartMs,
          isEnd: lastMs <= rangeLastDayMs,
        })
      } else {
        const spanning = lastMs - firstMs >= MS_PER_DAY

        if (spanning) {
          // Multi-day timed events go to all-day bar
          if (firstMs > rangeLastDayMs || lastMs < rangeStartMs) continue

          const clampedFirstMs = Math.max(firstMs, rangeStartMs)
          const clampedLastMs = Math.min(lastMs, rangeLastDayMs)

          const startCol = daysDiff(clampedFirstMs, rangeStartMs) + 1
          const endCol = daysDiff(clampedLastMs, rangeStartMs) + 2

          allDayItems.push({
            event,
            color,
            eventColor,
            startCol,
            endCol,
            lane: 0,
            isStart: firstMs >= rangeStartMs,
            isEnd: lastMs <= rangeLastDayMs,
          })
        } else {
          // Single-day timed event
          if (firstMs < rangeStartMs || firstMs >= rangeExclEndMs) continue

          const colIndex = daysDiff(firstMs, rangeStartMs)
          if (colIndex >= 0 && colIndex < N) {
            const dateKey = days[colIndex].dateKey
            const { top, height, durationMinutes } = computeTimedPosition(
              event,
              rangeStartMin,
              rangeMinutes,
            )
            timedByDay.get(dateKey)!.push({
              event,
              color,
              eventColor,
              top,
              height,
              column: 0,
              totalColumns: 1,
              durationMinutes,
              displayMode: displayModeFor(durationMinutes),
            })
          }
        }
      }
    }

    // Assign overlap columns for each day
    for (const layouts of timedByDay.values()) {
      assignOverlapColumns(layouts)
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
        if (!laneOccupied[lane]) laneOccupied[lane] = Array(N).fill(false) as boolean[]
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
      if (!laneOccupied[lane]) laneOccupied[lane] = Array(N).fill(false) as boolean[]
      for (let c = item.startCol - 1; c < item.endCol - 1; c++) {
        laneOccupied[lane][c] = true
      }
      item.lane = lane
      maxAllDayLane = Math.max(maxAllDayLane, lane)
    }

    return { allDayItems, maxAllDayLane, timedByDay }
  }, [days, events, calendars])
}
