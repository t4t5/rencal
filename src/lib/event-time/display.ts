import { Temporal } from "@js-temporal/polyfill"
import { t } from "@lingui/core/macro"

import { today } from "./constructors"
import { epochDay } from "./day"
import { getViewerTzid } from "./local-zone"
import { dateInViewerZone, isAllDay, toViewerZonedDateTime } from "./projections"
import type { EventTime } from "./types"

/** App-level mirror of the RPC `TimeFormat` type. */
export type TimeFormat = "24h" | "12h"

type DatePartStyle = "short" | "long"

/**
 * The locale for names and date patterns, as a BCP 47 tag. Set once at startup
 * from the user's locale (see src/lib/i18n); en-GB keeps the source-language
 * look. Formatters are rebuilt lazily whenever it changes.
 */
let displayLocale = "en-GB"
let formatterCache = new Map<string, Intl.DateTimeFormat>()

export function setDisplayLocale(tag: string): void {
  if (tag === displayLocale) return
  try {
    new Intl.DateTimeFormat(tag)
  } catch {
    console.warn(`Ignoring unknown display locale "${tag}"`)
    return
  }
  displayLocale = tag
  formatterCache = new Map()
}

function dateFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options)
  let f = formatterCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(displayLocale, { ...options, timeZone: "UTC" })
    formatterCache.set(key, f)
  }
  return f
}

function epochMilliseconds(date: Temporal.PlainDate): number {
  return date.toZonedDateTime("UTC").epochMilliseconds
}

function formatDate(date: Temporal.PlainDate, options: Intl.DateTimeFormatOptions): string {
  const withYear = date.year !== today().year ? { ...options, year: "numeric" as const } : options
  return dateFormatter(withYear).format(epochMilliseconds(date))
}

/** "YYYY-MM-DD" in the viewer's local zone. Used as a stable grouping key. */
export function formatDateKey(value: EventTime | Temporal.PlainDate): string {
  return (value instanceof Temporal.PlainDate ? value : dateInViewerZone(value)).toString()
}

export function formatWeekday(date: Temporal.PlainDate, style: DatePartStyle): string {
  return dateFormatter({ weekday: style }).format(epochMilliseconds(date))
}

export function formatMonth(date: Temporal.PlainDate, style: DatePartStyle): string {
  return dateFormatter({ month: style }).format(epochMilliseconds(date))
}

/** "April 2030" / "April 2030" / "avril 2030". */
export function formatMonthYear(date: Temporal.PlainDate): string {
  return dateFormatter({ month: "long", year: "numeric" }).format(epochMilliseconds(date))
}

// 1 January 2024 was a Monday.
const REFERENCE_MONDAY = Temporal.PlainDate.from("2024-01-01")

/** Weekday names in ISO order: index 0 is Monday, 6 is Sunday. */
export function weekdayNames(style: DatePartStyle): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    formatWeekday(REFERENCE_MONDAY.add({ days: i }), style),
  )
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

/** "Mon, 28 Apr" / "So., 28. Apr.", with the year when not the current year. */
export function formatShortDate(value: EventTime | Temporal.PlainDate): string {
  const date = value instanceof Temporal.PlainDate ? value : dateInViewerZone(value)
  return formatDate(date, { weekday: "short", day: "numeric", month: "short" })
}

/** "Thursday, 5 November" / "Donnerstag, 5. November", with the year when not the current year. */
export function formatLongDate(value: EventTime | Temporal.PlainDate): string {
  const date = value instanceof Temporal.PlainDate ? value : dateInViewerZone(value)
  return formatDate(date, { weekday: "long", day: "numeric", month: "long" })
}

/** "28 Apr" / "28. Apr.", with the year when not the current year. */
export function formatDayMonth(date: Temporal.PlainDate): string {
  return formatDate(date, { day: "numeric", month: "short" })
}

/** "Today" / "Tomorrow" / "Yesterday" / weekday name. */
export function getRelativeDayLabel(value: EventTime | Temporal.PlainDate): string {
  const date = value instanceof Temporal.PlainDate ? value : dateInViewerZone(value)
  const diffDays = epochDay(date) - epochDay(today())
  if (diffDays === 0) return t`Today`
  if (diffDays === 1) return t`Tomorrow`
  if (diffDays === -1) return t`Yesterday`
  return formatWeekday(date, "long")
}
