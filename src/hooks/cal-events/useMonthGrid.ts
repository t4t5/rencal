import { Temporal } from "@js-temporal/polyfill"
import { useMemo } from "react"

import { useToday } from "@/hooks/useToday"
import { formatDateKey, startOfWeek } from "@/lib/event-time"

export type MonthDay = {
  date: Temporal.PlainDate
  dateKey: string
  isToday: boolean
  isWeekend: boolean
}

export function buildDay(date: Temporal.PlainDate, today: Temporal.PlainDate): MonthDay {
  return {
    date,
    dateKey: formatDateKey(date),
    isToday: date.equals(today),
    isWeekend: date.dayOfWeek === 6 || date.dayOfWeek === 7,
  }
}

export function monthGridBounds(
  rangeStart: Temporal.PlainDate,
  rangeEnd: Temporal.PlainDate,
): { gridStart: Temporal.PlainDate; gridEnd: Temporal.PlainDate } {
  return { gridStart: startOfWeek(rangeStart), gridEnd: startOfWeek(rangeEnd) }
}

/**
 * Generates weeks covering the range [rangeStart, rangeEnd).
 * Both should be the 1st of a month (i.e. `.with({ day: 1 })`).
 */
export function useMonthGrid(rangeStart: Temporal.PlainDate, rangeEnd: Temporal.PlainDate) {
  const today = useToday()

  return useMemo(() => {
    const { gridStart, gridEnd } = monthGridBounds(rangeStart, rangeEnd)

    const weeks: MonthDay[][] = []
    let current = gridStart

    while (Temporal.PlainDate.compare(current, gridEnd) < 0) {
      const week: MonthDay[] = []
      for (let d = 0; d < 7; d++) {
        const date = current.add({ days: d })
        week.push(buildDay(date, today))
      }
      weeks.push(week)
      current = current.add({ days: 7 })
    }

    return weeks
  }, [rangeStart, rangeEnd, today])
}
