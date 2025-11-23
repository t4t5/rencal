import { useCallback } from "react"

import { Calendar } from "@/components/ui/calendar"

import { useCalendar } from "@/contexts/CalendarContext"

export function StatefulCalendar() {
  const { activeDate, setActiveDate } = useCalendar()

  const handleMonthChange = useCallback((newMonth: Date) => {
    setActiveDate(newMonth)
  }, [])

  const handleDateSelect = useCallback((date: Date) => {
    setActiveDate(date)
  }, [])

  return (
    <Calendar
      mode="single"
      selected={activeDate}
      onSelect={handleDateSelect}
      month={activeDate}
      onMonthChange={handleMonthChange}
      className="bg-transparent p-0"
      required
    />
  )
}
