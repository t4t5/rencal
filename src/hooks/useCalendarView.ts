import { CALENDAR_VIEW_KEY, calendarViewSchema } from "@/lib/calendar-view"

import { useLocalStorage } from "./useLocalStorage"

export const useCalendarView = () => {
  const [calendarView, setCalendarView] = useLocalStorage(
    CALENDAR_VIEW_KEY,
    calendarViewSchema,
    "month",
  )

  return { calendarView, setCalendarView }
}
