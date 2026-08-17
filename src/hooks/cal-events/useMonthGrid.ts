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

/**
 * Generates weeks covering the range [rangeStart, rangeEnd).
 * Both should be the 1st of a month (e.g. from startOfMonth).
 */
export function useMonthGrid(rangeStart: Temporal.PlainDate, rangeEnd: Temporal.PlainDate) {
  const today = useToday()

  return useMemo(() => {
    const gridStart = startOfWeek(rangeStart)
    const gridEnd = startOfWeek(rangeEnd)

    const weeks: MonthDay[][] = []
    let current = gridStart

    while (Temporal.PlainDate.compare(current, gridEnd) < 0) {
      const week: MonthDay[] = []
      for (let d = 0; d < 7; d++) {
        const date = current.add({ days: d })
        week.push({
          date,
          dateKey: formatDateKey(date),
          isToday: date.equals(today),
          isWeekend: date.dayOfWeek === 6 || date.dayOfWeek === 7,
        })
      }
      weeks.push(week)
      current = current.add({ days: 7 })
    }

    return weeks
  }, [rangeStart, rangeEnd, today])
}
