import { format, isToday, isTomorrow, isYesterday } from "date-fns"

export function getRelativeDayLabel(date: Date): string {
  if (isToday(date)) return "Today"
  if (isTomorrow(date)) return "Tomorrow"
  if (isYesterday(date)) return "Yesterday"
  return format(date, "EEEE")
}
