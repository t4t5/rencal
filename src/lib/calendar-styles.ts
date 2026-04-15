import { Calendar } from "@/rpc/bindings"

const DEFAULT_CALENDAR_COLOR = "#888"

export const getCalendarColor = (calendar: Calendar) => {
  return calendar.color ?? DEFAULT_CALENDAR_COLOR
}
