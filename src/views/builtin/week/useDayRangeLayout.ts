import { useMemo } from "react"

import {
  type AllDayBar,
  type CalendarEvent,
  epochDay,
  isSpanning,
  layoutAllDay,
  layoutTimed,
  type TimedBlock,
} from "@/sdk"

import type { WeekDay } from "./useInfiniteDays"

export type DayRangeLayout = {
  allDayBars: AllDayBar<CalendarEvent>[]
  allDayLaneCount: number
  timedByDay: Map<string, TimedBlock<CalendarEvent>[]>
}

export function useDayRangeLayout(
  days: WeekDay[],
  events: readonly CalendarEvent[],
): DayRangeLayout {
  return useMemo(() => {
    const N = days.length
    if (N === 0) {
      return { allDayBars: [], allDayLaneCount: 0, timedByDay: new Map() }
    }

    const rangeStartDay = epochDay(days[0].date)
    const spanning: CalendarEvent[] = []
    const timed: CalendarEvent[][] = days.map(() => [])

    for (const event of events) {
      if (isSpanning(event)) {
        spanning.push(event)
        continue
      }
      timed[epochDay(event.firstDay) - rangeStartDay]?.push(event)
    }

    const { bars, laneCount } = layoutAllDay(spanning, days[0].date, N)
    const timedByDay = new Map(days.map((day, i) => [day.dateKey, layoutTimed(timed[i])]))

    return { allDayBars: bars, allDayLaneCount: laneCount, timedByDay }
  }, [days, events])
}
