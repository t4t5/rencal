import { addDays, isSameDay, startOfWeek } from "date-fns"
import { useMemo } from "react"

import { formatDateKey } from "@/lib/time"

import type { MonthDay } from "./useMonthGrid"

export function useWeekDays(activeDate: Date): MonthDay[] {
  return useMemo(() => {
    const weekStart = startOfWeek(activeDate, { weekStartsOn: 1 })
    const today = new Date()

    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i)
      return {
        date,
        dateKey: formatDateKey(date),
        isToday: isSameDay(date, today),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      }
    })
  }, [activeDate])
}
