import { format, getYear, isToday, isTomorrow, isYesterday } from "date-fns"

import type { TimeFormat } from "@/rpc/bindings"

import type { CalendarEvent } from "./cal-events"
import {
  type EventDateTime,
  dateToPlainDate,
  formatDateKey as etFormatDateKey,
  formatTime as etFormatTime,
  getEventDayRange as etGetEventDayRange,
  isAllDay,
  toJsDate,
} from "./event-time"

// Re-export the canonical day-math helpers from event-time.ts so callers don't
// need to know about the split. New code should import directly from event-time.
export { MS_PER_DAY, normalizeAllDayRange, startOfDayMs } from "./event-time"

/** Date-key in the viewer's local zone. Accepts EventDateTime or a JS Date. */
export function formatDateKey(d: EventDateTime | Date): string {
  if (d instanceof Date) return etFormatDateKey(dateToPlainDate(d))
  return etFormatDateKey(d)
}

/** Inclusive [firstMs, lastMs] range of local midnights the event occupies. */
export function getEventDayRange(event: CalendarEvent): { firstMs: number; lastMs: number } {
  return etGetEventDayRange(event.start, event.end)
}

export function formatTime(et: EventDateTime, timeFormat: TimeFormat): string {
  return etFormatTime(et, timeFormat)
}

export function formatShortDate(et: EventDateTime | Date): string {
  const d = et instanceof Date ? et : toJsDate(et)
  const pattern = getYear(d) !== getYear(new Date()) ? "EEE, d MMM yyyy" : "EEE, d MMM"
  return format(d, pattern)
}

export function getRelativeDayLabel(et: EventDateTime | Date): string {
  const d = et instanceof Date ? et : toJsDate(et)
  if (isToday(d)) return "Today"
  if (isTomorrow(d)) return "Tomorrow"
  if (isYesterday(d)) return "Yesterday"
  return format(d, "EEEE")
}

export { isAllDay }
