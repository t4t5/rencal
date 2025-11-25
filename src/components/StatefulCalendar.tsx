import { useCallback } from "react"

import { Calendar } from "@/components/ui/calendar"

import { useCalendar } from "@/contexts/CalendarContext"

export function StatefulCalendar() {
  const { activeDate, navigateToDate } = useCalendar()

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
