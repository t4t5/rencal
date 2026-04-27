import { Temporal } from "@js-temporal/polyfill"
import { format, getYear, isToday, isTomorrow, isYesterday } from "date-fns"

import type { TimeFormat } from "@/rpc/bindings"

import { allDayFromLocalDate } from "./constructors"
import { getLocalTzid } from "./local-zone"
import { dateInViewerZone, isAllDay, toInteropDate, toViewerZonedDateTime } from "./projections"
import type { EventTime } from "./types"

/** "YYYY-MM-DD" in the viewer's local zone. Used as a stable grouping key. */
export function formatDateKey(et: EventTime | Date): string {
  if (et instanceof Date) return dateInViewerZone(allDayFromLocalDate(et)).toString()
  return dateInViewerZone(et).toString()
}

const timeFormatters: Partial<Record<TimeFormat, Intl.DateTimeFormat>> = {}

function getTimeFormatter(timeFormat: TimeFormat): Intl.DateTimeFormat {
  let f = timeFormatters[timeFormat]
  if (!f) {
    f = new Intl.DateTimeFormat(timeFormat === "12h" ? "en-US" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: timeFormat === "12h" ? "h12" : "h23",
      timeZone: getLocalTzid(),
    })
    timeFormatters[timeFormat] = f
  }
  return f
}

export function formatTime(et: EventTime, timeFormat: TimeFormat): string {
  if (isAllDay(et)) return ""
  return getTimeFormatter(timeFormat).format(toViewerZonedDateTime(et).epochMilliseconds)
}

/** "Mon, 28 Apr" or "Mon, 28 Apr 2027" if not the current year. */
export function formatShortDate(et: EventTime | Date): string {
  const d = et instanceof Date ? et : toInteropDate(et)
  const pattern = getYear(d) !== getYear(new Date()) ? "EEE, d MMM yyyy" : "EEE, d MMM"
  return format(d, pattern)
}

/** "Today" / "Tomorrow" / "Yesterday" / weekday name. */
export function getRelativeDayLabel(et: EventTime | Date): string {
  const d = et instanceof Date ? et : toInteropDate(et)
  if (isToday(d)) return "Today"
  if (isTomorrow(d)) return "Tomorrow"
  if (isYesterday(d)) return "Yesterday"
  return format(d, "EEEE")
}

export function plainDateToLocalDate(pd: Temporal.PlainDate): Date {
  return new Date(pd.year, pd.month - 1, pd.day)
}

export function localDateToPlainDate(d: Date): Temporal.PlainDate {
  return new Temporal.PlainDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}
