import { Temporal } from "@js-temporal/polyfill"

import { formatWallclockTime, type TimeFormat } from "@/sdk"

/** A timezone's column in the time gutter. */
export type GutterZone = {
  tzid: string
  /** The viewer's own zone: the one the grid's days and events are laid out in. */
  local: boolean
}

/** `hour` o'clock on `date` in the viewer's zone, as `tzid` reads it then. */
export function hourInZone(
  date: Temporal.PlainDate,
  hour: number,
  viewerTzid: string,
  tzid: string,
): { hour: number; minute: number } {
  if (tzid === viewerTzid) return { hour, minute: 0 }
  const there = date
    .toZonedDateTime({ timeZone: viewerTzid, plainTime: new Temporal.PlainTime(hour) })
    .withTimeZone(tzid)
  return { hour: there.hour, minute: there.minute }
}

/**
 * An hour label for the time gutter. 12-hour times are shortened ("9 AM", "noon", "9:30a")
 * because "10:00 AM" is wider than a gutter column; 24-hour times already fit.
 */
export function formatZoneHour(
  { hour, minute }: { hour: number; minute: number },
  timeFormat: TimeFormat,
): string {
  if (timeFormat === "24h") return formatWallclockTime(hour, minute, timeFormat)
  if (hour === 12 && minute === 0) return "noon"
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  if (minute === 0) return `${h12} ${hour < 12 ? "AM" : "PM"}`
  return `${h12}:${String(minute).padStart(2, "0")}${hour < 12 ? "a" : "p"}`
}

const midday = (date: Temporal.PlainDate, tzid: string) =>
  date.toZonedDateTime({ timeZone: tzid, plainTime: new Temporal.PlainTime(12) })

/**
 * The zone's short name on `date`, like "PST": it changes with daylight saving. A zone with no
 * name of its own is its offset alone ("+5:30"), since "GMT+5:30" is wider than a gutter column.
 */
export function zoneAbbreviation(tzid: string, date: Temporal.PlainDate): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tzid,
    timeZoneName: "short",
  }).formatToParts(midday(date, tzid).epochMilliseconds)
  const name = parts.find((part) => part.type === "timeZoneName")?.value ?? tzid
  return name.replace(/^GMT(?=[+-])/, "")
}

/** "Los Angeles, GMT-8": the zone's city and its UTC offset on `date`. */
export function zoneDescription(tzid: string, date: Temporal.PlainDate): string {
  const city = tzid.slice(tzid.lastIndexOf("/") + 1).replaceAll("_", " ")
  const offset = midday(date, tzid).offset // "-08:00"
  const [hours, minutes] = offset.slice(1).split(":")
  return `${city}, GMT${offset[0]}${Number(hours)}${minutes === "00" ? "" : `:${minutes}`}`
}
