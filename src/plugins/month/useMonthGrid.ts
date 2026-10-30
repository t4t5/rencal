import { Temporal } from "@js-temporal/polyfill"
import { useMemo } from "react"

import { useToday } from "@/sdk"

export type MonthDay = {
  date: Temporal.PlainDate
  dateKey: string
  isToday: boolean
  isWeekend: boolean
}

function buildDay(date: Temporal.PlainDate, today: Temporal.PlainDate): MonthDay {
  return {
    date,
    dateKey: date.toString(),
    isToday: date.equals(today),
    isWeekend: date.dayOfWeek === 6 || date.dayOfWeek === 7,
  }
}

/** The seven days of the week `index` weeks after `origin`. */
export function buildWeek(
  origin: Temporal.PlainDate,
  index: number,
  today: Temporal.PlainDate,
): MonthDay[] {
  const weekStart = origin.add({ weeks: index })
  return Array.from({ length: 7 }, (_, d) => buildDay(weekStart.add({ days: d }), today))
}

/** The weeks [start, end) on the track that begins at `origin`. */
export function useMonthGrid(origin: Temporal.PlainDate, start: number, end: number) {
  const today = useToday()

  return useMemo(
    () => Array.from({ length: end - start }, (_, i) => buildWeek(origin, start + i, today)),
    [origin, start, end, today],
  )
}
