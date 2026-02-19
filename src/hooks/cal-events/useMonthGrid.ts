import { addDays, format, isSameDay, startOfWeek } from "date-fns"
import { useMemo } from "react"

export type MonthDay = {
  date: Date
  dateKey: string
  isToday: boolean
  isWeekend: boolean
}

/**
 * Generates weeks covering the range [rangeStart, rangeEnd).
 * Both should be the 1st of a month (e.g. from startOfMonth).
 */
export function useMonthGrid(rangeStart: Date, rangeEnd: Date) {
  return useMemo(() => {
    const gridStart = startOfWeek(rangeStart, { weekStartsOn: 1 })
    const gridEnd = startOfWeek(rangeEnd, { weekStartsOn: 1 })
    const today = new Date()

    const weeks: MonthDay[][] = []
    let current = gridStart

    while (current < gridEnd) {
      const week: MonthDay[] = []
      for (let d = 0; d < 7; d++) {
        const date = addDays(current, d)
        week.push({
          date,
          dateKey: format(date, "yyyy-MM-dd"),
          isToday: isSameDay(date, today),
          isWeekend: date.getDay() === 0 || date.getDay() === 6,
        })
      }
      weeks.push(week)
      current = addDays(current, 7)
    }

    return weeks
  }, [rangeStart, rangeEnd])
}
