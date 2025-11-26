import { useCallback } from "react"

import { Calendar } from "@/components/ui/calendar"

import { useCalendarState } from "@/contexts/CalendarStateContext"

export function StatefulCalendar() {
  const { activeDate, navigateToDate } = useCalendarState()

  const handleDateSelect = useCallback(
    (date: Date) => {
      navigateToDate(date)
    },
    [navigateToDate],
  )

  return (
    <Calendar
      mode="single"
      selected={activeDate}
      onSelect={handleDateSelect}
      month={activeDate}
      onMonthChange={handleDateSelect}
      className="bg-transparent p-0"
      required
    />
  )
}
