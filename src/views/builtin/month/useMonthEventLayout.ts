import { useMemo } from "react"

import { type AllDayBar, type CalendarEvent, epochDay, isSpanning, layoutAllDay } from "@/sdk"

import type { MonthDay } from "./useMonthGrid"

export type WeekLayout = {
  /** The week's spanning events, to lay out again with a create selection among them. */
  allDayEvents: CalendarEvent[]
  allDayBars: AllDayBar<CalendarEvent>[]
  timedByCol: CalendarEvent[][] // index 0-6 for each day column
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
    if (weeks.length === 0) return []
    const allDayByWeek: CalendarEvent[][] = weeks.map(() => [])
    const timedByWeek: CalendarEvent[][][] = weeks.map(() => Array.from({ length: 7 }, () => []))

    const rangeFirstDay = epochDay(weeks[0][0].date)
    const rangeDays = weeks.length * 7

    for (const event of events) {
      const firstDay = epochDay(event.firstDay)

      if (isSpanning(event)) {
        const lastDay = epochDay(event.lastDay)
        const fromWeek = Math.max(0, Math.floor((firstDay - rangeFirstDay) / 7))
        const toWeek = Math.min(weeks.length - 1, Math.floor((lastDay - rangeFirstDay) / 7))
        for (let week = fromWeek; week <= toWeek; week++) allDayByWeek[week].push(event)
      } else {
        // Single-day timed event
        const offset = firstDay - rangeFirstDay
        if (offset >= 0 && offset < rangeDays) {
          timedByWeek[Math.floor(offset / 7)][offset % 7].push(event)
        }
      }
    }

    return weeks.map((week, i) => {
      // A drag preview is appended after the sorted events.
      for (const col of timedByWeek[i]) {
        col.sort((a, b) => a.startMinutes - b.startMinutes)
      }
      return {
        allDayEvents: allDayByWeek[i],
        allDayBars: layoutAllDay(allDayByWeek[i], week[0].date, 7).bars,
        timedByCol: timedByWeek[i],
      }
    })
  }, [weeks, events])
}
