import { useMemo } from "react"

import {
  type AllDayBar,
  type CalendarEvent,
  eventsByDay,
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

    const spanning: CalendarEvent[] = []
    const timed: CalendarEvent[] = []
    for (const event of events) (isSpanning(event) ? spanning : timed).push(event)

    const { bars, laneCount } = layoutAllDay(spanning, days[0].date, N)
    // An event crossing midnight is laid out on each day it touches.
    const timedDays = eventsByDay(timed, days[0].date, days[N - 1].date.add({ days: 1 }))
    const timedByDay = new Map(
      timedDays.map((day, i) => [days[i].dateKey, layoutTimed(day.events, day.date)]),
    )

    return { allDayBars: bars, allDayLaneCount: laneCount, timedByDay }
  }, [days, events])
}
