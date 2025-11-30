import { useCallback } from "react"

import { CalendarBig } from "@/components/ui/calendar-big"

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
    <CalendarBig
      mode="single"
      selected={activeDate}
      onSelect={handleDateSelect}
      month={activeDate}
      onMonthChange={handleDateSelect}
      className="bg-transparent p-0 pt-4"
      required
    />
  )
}
