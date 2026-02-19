import { addDays, format, getMonth, getYear, isSameDay, startOfMonth, startOfWeek } from "date-fns"
import { useMemo } from "react"

export type MonthDay = {
  date: Date
  dateKey: string
  isCurrentMonth: boolean
  isToday: boolean
  isWeekend: boolean
}

export function useMonthGrid(activeDate: Date): MonthDay[][] {
  return useMemo(() => {
    const monthStart = startOfMonth(activeDate)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const activeMonth = getMonth(activeDate)
    const activeYear = getYear(activeDate)
    const today = new Date()

    const weeks: MonthDay[][] = []

    for (let w = 0; w < 6; w++) {
      const week: MonthDay[] = []
      for (let d = 0; d < 7; d++) {
        const date = addDays(gridStart, w * 7 + d)
        const dayOfWeek = date.getDay()
        week.push({
          date,
          dateKey: format(date, "yyyy-MM-dd"),
          isCurrentMonth: getMonth(date) === activeMonth && getYear(date) === activeYear,
          isToday: isSameDay(date, today),
          isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        })
      }
      weeks.push(week)
    }

    return weeks
  }, [activeDate])
}
