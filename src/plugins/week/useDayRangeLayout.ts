import { useMemo } from "react"

import {
  type AllDaySpan,
  assignAllDayLanes,
  type CalendarEvent,
  clipSpanToRange,
  epochDay,
  isAllDay,
  layoutTimedOverlaps,
  type TimedBox,
} from "@/sdk"

import { DAY_MINUTES } from "./grid"
import type { WeekDay } from "./useInfiniteDays"

export type WeekEventDisplayMode = "xs" | "sm" | "md" | "lg"

export type WeekTimedEventLayout = TimedBox & {
  event: CalendarEvent
  durationMinutes: number
  displayMode: WeekEventDisplayMode
}

export type AllDayLaneItem = AllDaySpan & {
  event: CalendarEvent
  lane: number
}

export type DayRangeLayout = {
  allDayItems: AllDayLaneItem[]
  maxAllDayLane: number
  timedByDay: Map<string, WeekTimedEventLayout[]>
}

/** All-day events always occupy the all-day lane; timed events only if they cross a day boundary. */
function isSpanning(event: CalendarEvent): boolean {
  return isAllDay(event.start) || !event.lastDay.equals(event.firstDay)
}

// Thresholds are the shortest durations whose block fits each mode's lines at 48px per hour.
function displayModeFor(durationMinutes: number): WeekEventDisplayMode {
  if (durationMinutes < 45) return "xs"
  if (durationMinutes < 60) return "sm"
  if (durationMinutes < 75) return "md"
  return "lg"
}

export function useDayRangeLayout(
  days: WeekDay[],
  events: readonly CalendarEvent[],
): DayRangeLayout {
  return useMemo(() => {
    const N = days.length
    if (N === 0) {
      return { allDayItems: [], maxAllDayLane: -1, timedByDay: new Map() }
    }

    const rangeStartDay = epochDay(days[0].date)
    const rangeLastDay = epochDay(days[N - 1].date)

    const allDayItems: AllDayLaneItem[] = []
    const timedByDay = new Map<string, WeekTimedEventLayout[]>()
    for (const day of days) {
      timedByDay.set(day.dateKey, [])
    }

    for (const event of events) {
      const firstDay = epochDay(event.firstDay)

      if (isSpanning(event)) {
        const span = clipSpanToRange(firstDay, epochDay(event.lastDay), rangeStartDay, rangeLastDay)
        if (span) allDayItems.push({ ...span, event, lane: 0 })
        continue
      }

      const colIndex = firstDay - rangeStartDay
      if (colIndex < 0 || colIndex >= N) continue

      // An event ending at midnight ends at the bottom of its day.
      const durationMinutes = Math.min(event.endMinutes, DAY_MINUTES) - event.startMinutes
      const top = (event.startMinutes / DAY_MINUTES) * 100
      timedByDay.get(days[colIndex].dateKey)!.push({
        event,
        top,
        height: (durationMinutes / DAY_MINUTES) * 100,
        left: 0,
        width: 1,
        coveredWidth: 0,
        durationMinutes,
        displayMode: displayModeFor(durationMinutes),
      })
    }

    for (const layouts of timedByDay.values()) {
      layoutTimedOverlaps(layouts)
    }

    const maxAllDayLane = assignAllDayLanes(allDayItems, N)

    return { allDayItems, maxAllDayLane, timedByDay }
  }, [days, events])
}
