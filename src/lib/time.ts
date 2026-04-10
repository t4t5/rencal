import { format, getYear, isToday, isTomorrow, isYesterday, parseISO } from "date-fns"

import type { TimeFormat } from "@/rpc/bindings"

export function formatTime(date: Date | string, timeFormat: TimeFormat): string {
  const d = typeof date === "string" ? parseISO(date) : date
  return format(d, timeFormat === "12h" ? "h:mm a" : "HH:mm")
}

/** Fast "yyyy-MM-dd" formatting without date-fns overhead. */
export function formatDateKey(date: Date | string): string {
  if (typeof date === "string") {
    // Already an ISO string — extract the date part
    return date.slice(0, 10)
  }
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  return `${y}-${m < 10 ? "0" : ""}${m}-${d < 10 ? "0" : ""}${d}`
}

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
