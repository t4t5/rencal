import { useMemo } from "react"

import type { Calendar } from "@/rpc/bindings"

import type { CalendarEvent } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { DAY_MINUTES, epochDay } from "@/lib/event-time"
import { isSpanning } from "@/lib/event-utils"

import { assignAllDayLanes, buildAllDaySpan, type AllDayLaneItem } from "./all-day-lanes"
import type { MonthDay } from "./useMonthGrid"

export type WeekEventDisplayMode = "xs" | "sm" | "md" | "lg"

export type WeekTimedEventLayout = {
  event: CalendarEvent
  calendarColor: string | null
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

/** Returns top and height as percentages (0–100) of the visible range */
function computeTimedPosition(
  event: CalendarEvent,
  rangeStartMin: number,
  rangeMinutes: number,
): { top: number; height: number; durationMinutes: number } {
  // Pre-computed at the EventTime → CalendarEvent boundary; expressed in
  // the viewer's local zone (matches Google/Apple calendar UIs).
  const { startLocalMinutes, endLocalMinutes, firstDay, endDay } = event.dateInfo

  // If event spans midnight, clamp end to end of day
  const durationMinutes =
    endDay > firstDay ? DAY_MINUTES - startLocalMinutes : endLocalMinutes - startLocalMinutes

  const top = ((startLocalMinutes - rangeStartMin) / rangeMinutes) * 100
  const height = (durationMinutes / rangeMinutes) * 100

  return { top, height, durationMinutes }
}

function displayModeFor(durationMinutes: number): WeekEventDisplayMode {
  if (durationMinutes < 30) return "xs"
  if (durationMinutes < 45) return "sm"
  if (durationMinutes < 60) return "md"
  return "lg"
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

    const rangeStartDay = epochDay(days[0].date)
    const rangeLastDay = epochDay(days[N - 1].date)
    const rangeExclEndDay = rangeLastDay + 1

    const rangeStartMin = 0
    const rangeMinutes = DAY_MINUTES

    const allDayItems: AllDayLaneItem[] = []
    const timedByDay = new Map<string, WeekTimedEventLayout[]>()
    for (const day of days) {
      timedByDay.set(day.dateKey, [])
    }

    for (const event of events) {
      const { firstDay } = event.dateInfo
      const calendarColor = getCalendarColor(calMap.get(event.calendar_slug))

      if (isSpanning(event)) {
        const item = buildAllDaySpan(event, rangeStartDay, rangeLastDay, calendarColor)
        if (item) allDayItems.push(item)
      } else {
        // Single-day timed event
        if (firstDay < rangeStartDay || firstDay >= rangeExclEndDay) continue

        const colIndex = firstDay - rangeStartDay
        if (colIndex >= 0 && colIndex < N) {
          const dateKey = days[colIndex].dateKey
          const { top, height, durationMinutes } = computeTimedPosition(
            event,
            rangeStartMin,
            rangeMinutes,
          )
          timedByDay.get(dateKey)!.push({
            event,
            calendarColor,
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

    // Assign overlap columns for each day
    for (const layouts of timedByDay.values()) {
      assignOverlapColumns(layouts)
    }

    const maxAllDayLane = assignAllDayLanes(allDayItems, N)

    return { allDayItems, maxAllDayLane, timedByDay }
  }, [days, events, calendars])
}
