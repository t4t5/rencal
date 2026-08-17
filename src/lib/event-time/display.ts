import { Temporal } from "@js-temporal/polyfill"
import { format } from "date-fns"

import type { TimeFormat } from "@/rpc/bindings"

import { today } from "./constructors"
import { epochDay } from "./day"
import { plainDateToJsDate } from "./js-date"
import { getViewerTzid } from "./local-zone"
import { dateInViewerZone, isAllDay, toViewerZonedDateTime } from "./projections"
import type { EventTime } from "./types"

/** "YYYY-MM-DD" in the viewer's local zone. Used as a stable grouping key. */
export function formatDateKey(value: EventTime | Temporal.PlainDate): string {
  return (value instanceof Temporal.PlainDate ? value : dateInViewerZone(value)).toString()
}

/** Format a calendar day without leaking JS Date beyond the date-fns boundary. */
export function formatDay(date: Temporal.PlainDate, pattern: string): string {
  return format(plainDateToJsDate(date), pattern)
}

let timeFormatters: Partial<Record<TimeFormat, Intl.DateTimeFormat>> = {}
let timeFormattersTzid: string | undefined

function getTimeFormatter(timeFormat: TimeFormat): Intl.DateTimeFormat {
  const tzid = getViewerTzid()
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
export function formatShortDate(value: EventTime | Temporal.PlainDate): string {
  const date = value instanceof Temporal.PlainDate ? value : dateInViewerZone(value)
  const pattern = date.year !== today().year ? "EEE, d MMM yyyy" : "EEE, d MMM"
  return formatDay(date, pattern)
}

/** "Thursday, 5 November" (adds the year when not the current year). */
export function formatLongDate(value: EventTime | Temporal.PlainDate): string {
  const date = value instanceof Temporal.PlainDate ? value : dateInViewerZone(value)
  const pattern = date.year !== today().year ? "EEEE, d MMMM yyyy" : "EEEE, d MMMM"
  return formatDay(date, pattern)
}

/** "Today" / "Tomorrow" / "Yesterday" / weekday name. */
export function getRelativeDayLabel(value: EventTime | Temporal.PlainDate): string {
  const date = value instanceof Temporal.PlainDate ? value : dateInViewerZone(value)
  const diffDays = epochDay(date) - epochDay(today())
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Tomorrow"
  if (diffDays === -1) return "Yesterday"
  return formatDay(date, "EEEE")
}
