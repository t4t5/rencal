import { Temporal } from "@js-temporal/polyfill"

import type { TimeFormat } from "@/rpc/bindings"

import { today } from "./constructors"
import { epochDay } from "./day"
import { getViewerTzid } from "./local-zone"
import { dateInViewerZone, isAllDay, toViewerZonedDateTime } from "./projections"
import type { EventTime } from "./types"

type DatePartStyle = "short" | "long"

const weekdayFormatters: Record<DatePartStyle, Intl.DateTimeFormat> = {
  short: new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }),
  long: new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }),
}

const monthFormatters: Record<DatePartStyle, Intl.DateTimeFormat> = {
  short: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }),
  long: new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }),
}

function epochMilliseconds(date: Temporal.PlainDate): number {
  return date.toZonedDateTime("UTC").epochMilliseconds
}

function yearSuffix(date: Temporal.PlainDate): string {
  return date.year !== today().year ? ` ${date.year}` : ""
}

/** "YYYY-MM-DD" in the viewer's local zone. Used as a stable grouping key. */
export function formatDateKey(value: EventTime | Temporal.PlainDate): string {
  return (value instanceof Temporal.PlainDate ? value : dateInViewerZone(value)).toString()
}

export function formatWeekday(date: Temporal.PlainDate, style: DatePartStyle): string {
  return weekdayFormatters[style].format(epochMilliseconds(date))
}

export function formatMonth(date: Temporal.PlainDate, style: DatePartStyle): string {
  return monthFormatters[style].format(epochMilliseconds(date))
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
  return `${formatWeekday(date, "short")}, ${date.day} ${formatMonth(date, "short")}${yearSuffix(date)}`
}

/** "Thursday, 5 November" (adds the year when not the current year). */
export function formatLongDate(value: EventTime | Temporal.PlainDate): string {
  const date = value instanceof Temporal.PlainDate ? value : dateInViewerZone(value)
  return `${formatWeekday(date, "long")}, ${date.day} ${formatMonth(date, "long")}${yearSuffix(date)}`
}

/** "28 Apr" or "28 Apr 2027" if not the current year. */
export function formatDayMonth(date: Temporal.PlainDate): string {
  return `${date.day} ${formatMonth(date, "short")}${yearSuffix(date)}`
}

/** "Today" / "Tomorrow" / "Yesterday" / weekday name. */
export function getRelativeDayLabel(value: EventTime | Temporal.PlainDate): string {
  const date = value instanceof Temporal.PlainDate ? value : dateInViewerZone(value)
  const diffDays = epochDay(date) - epochDay(today())
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Tomorrow"
  if (diffDays === -1) return "Yesterday"
  return formatWeekday(date, "long")
}
