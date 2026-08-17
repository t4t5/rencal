import { Temporal } from "@js-temporal/polyfill"
import { differenceInCalendarDays, format, getYear } from "date-fns"

import type { TimeFormat } from "@/rpc/bindings"

import { allDayFromLocalDate, todayLocalDate } from "./constructors"
import { getLocalTzid } from "./local-zone"
import {
  dateInViewerZone,
  isAllDay,
  localDateInViewerZone,
  toViewerZonedDateTime,
} from "./projections"
import type { EventTime } from "./types"

/** "YYYY-MM-DD" in the viewer's local zone. Used as a stable grouping key. */
export function formatDateKey(et: EventTime | Date): string {
  if (et instanceof Date) return dateInViewerZone(allDayFromLocalDate(et)).toString()
  return dateInViewerZone(et).toString()
}

let timeFormatters: Partial<Record<TimeFormat, Intl.DateTimeFormat>> = {}
let timeFormattersTzid: string | undefined

function getTimeFormatter(timeFormat: TimeFormat): Intl.DateTimeFormat {
  const tzid = getLocalTzid()
  // Formatters bake in the timeZone, so drop the cache when the viewer's zone changes.
  if (timeFormattersTzid !== tzid) {
    timeFormatters = {}
    timeFormattersTzid = tzid
  }
  let f = timeFormatters[timeFormat]
  if (!f) {
    f = new Intl.DateTimeFormat(timeFormat === "12h" ? "en-US" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: timeFormat === "12h" ? "h12" : "h23",
      timeZone: tzid,
    })
    timeFormatters[timeFormat] = f
  }
  return f
}

export function formatTime(et: EventTime, timeFormat: TimeFormat): string {
  if (isAllDay(et)) return ""
  return getTimeFormatter(timeFormat).format(toViewerZonedDateTime(et).epochMilliseconds)
}

/**
 * Format a wallclock hour (0–23) and minute per the 12h/24h setting,
 * e.g. "15:30" (24h) or "3:30 PM" (12h). Zone-agnostic — it formats a
 * time-of-day rather than an instant, so it's safe for time-picker option
 * labels where there is no underlying EventTime.
 */
export function formatWallclockTime(hour: number, minute: number, timeFormat: TimeFormat): string {
  const mm = String(minute).padStart(2, "0")
  if (timeFormat === "24h") return `${String(hour).padStart(2, "0")}:${mm}`
  const period = hour < 12 ? "AM" : "PM"
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${mm} ${period}`
}

/** "Mon, 28 Apr" or "Mon, 28 Apr 2027" if not the current year. */
export function formatShortDate(et: EventTime | Date): string {
  const d = et instanceof Date ? et : localDateInViewerZone(et)
  const pattern = getYear(d) !== getYear(todayLocalDate()) ? "EEE, d MMM yyyy" : "EEE, d MMM"
  return format(d, pattern)
}

/** "Thursday, 5 November" (adds the year when not the current year). */
export function formatLongDate(et: EventTime | Date): string {
  const d = et instanceof Date ? et : localDateInViewerZone(et)
  const pattern = getYear(d) !== getYear(todayLocalDate()) ? "EEEE, d MMMM yyyy" : "EEEE, d MMMM"
  return format(d, pattern)
}

/** "Today" / "Tomorrow" / "Yesterday" / weekday name. */
export function getRelativeDayLabel(et: EventTime | Date): string {
  const d = et instanceof Date ? et : localDateInViewerZone(et)
  const diffDays = differenceInCalendarDays(d, todayLocalDate())
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Tomorrow"
  if (diffDays === -1) return "Yesterday"
  return format(d, "EEEE")
}

export function plainDateToLocalDate(pd: Temporal.PlainDate): Date {
  return new Date(pd.year, pd.month - 1, pd.day)
}

export function localDateToPlainDate(d: Date): Temporal.PlainDate {
  return new Temporal.PlainDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}
