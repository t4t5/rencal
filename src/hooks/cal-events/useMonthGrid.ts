import {
  addDays,
  addMonths,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"
import { useMemo } from "react"

export type MonthDay = {
  date: Date
  dateKey: string
  isToday: boolean
  isWeekend: boolean
}

/**
 * Generates a scrollable range of weeks centered on `anchorDate`.
 * Returns the weeks array and the index of the first week containing
 * the 1st of anchorDate's month (for initial scroll positioning).
 */
export function useMonthGrid(anchorDate: Date) {
  return useMemo(() => {
    const rangeStartMonth = startOfMonth(subMonths(anchorDate, 2))
    const rangeEndMonth = startOfMonth(addMonths(anchorDate, 3))
    const gridStart = startOfWeek(rangeStartMonth, { weekStartsOn: 1 })
    const gridEnd = startOfWeek(rangeEndMonth, { weekStartsOn: 1 })

    const today = new Date()
    const anchorFirst = startOfMonth(anchorDate)

    const weeks: MonthDay[][] = []
    let anchorWeekIndex = 0
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

      // Track the week that contains the 1st of the anchor month
      if (week.some((d) => isSameDay(d.date, anchorFirst))) {
        anchorWeekIndex = weeks.length
      }

      weeks.push(week)
      current = addDays(current, 7)
    }

    return { weeks, anchorWeekIndex }
  }, [anchorDate])
}
