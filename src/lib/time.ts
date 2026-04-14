import { format, getYear, isToday, isTomorrow, isYesterday, parseISO } from "date-fns"

import type { CalendarEvent, TimeFormat } from "@/rpc/bindings"

export const MS_PER_DAY = 86_400_000

/** Truncate a timestamp to local midnight (start of day) */
export function startOfDayMs(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : new Date(date.getTime())
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Inclusive [firstMs, lastMs] range of local midnights the event occupies.
 * DTEND is exclusive, so an end exactly at midnight belongs to the previous day.
 */
export function getEventDayRange(event: CalendarEvent): { firstMs: number; lastMs: number } {
  const firstMs = startOfDayMs(event.start)

  if (event.all_day) {
    const endMs = startOfDayMs(event.end)
    const lastMs = endMs > firstMs ? endMs - MS_PER_DAY : firstMs
    return { firstMs, lastMs }
  }

  const endMs = new Date(event.end).getTime()
  const endDayMs = startOfDayMs(event.end)
  const lastMs = endMs === endDayMs && endDayMs > firstMs ? endDayMs - MS_PER_DAY : endDayMs
  return { firstMs, lastMs }
}

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

/** Format a Date for sending to the backend: local date for all-day, UTC ISO string for timed. */
export function formatEventTime(date: Date, allDay: boolean): string {
  return allDay ? formatDateKey(date) : date.toISOString()
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
