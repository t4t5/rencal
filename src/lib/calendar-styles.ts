import { Calendar } from "@/rpc/bindings"

const DEFAULT_CALENDAR_COLOR = "var(--primary)"

export const getCalendarColor = (calendar: Calendar | undefined) => {
  return calendar?.color ?? DEFAULT_CALENDAR_COLOR
}
