import { format, getYear, isToday, isTomorrow, isYesterday } from "date-fns"

export function formatShortDate(date: Date): string {
  const pattern = getYear(date) !== getYear(new Date()) ? "EEE, d MMM yyyy" : "EEE, d MMM"
  return format(date, pattern)
}

export function getRelativeDayLabel(date: Date): string {
  if (isToday(date)) return "Today"
  if (isTomorrow(date)) return "Tomorrow"
  if (isYesterday(date)) return "Yesterday"
  return format(date, "EEEE")
}
