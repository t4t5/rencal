import { Temporal } from "@js-temporal/polyfill"

import { timeZoneAbbreviation } from "@/lib/event-time"

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
    .toZonedDateTime({ timeZone: viewerTzid, plainTime: Temporal.PlainTime.from({ hour }) })
    .withTimeZone(tzid)
  return { hour: there.hour, minute: there.minute }
}

const midday = (date: Temporal.PlainDate, tzid: string) =>
  date.toZonedDateTime({ timeZone: tzid, plainTime: Temporal.PlainTime.from({ hour: 12 }) })

/**
 * The zone's short name on `date`, like "PST": it changes with daylight saving. A zone the
 * tz database has no name for is its offset alone ("+4"), as narrow as a gutter column.
 */
export function zoneAbbreviation(tzid: string, date: Temporal.PlainDate): string {
  const name = timeZoneAbbreviation(tzid, midday(date, tzid).epochMilliseconds)
  const numeric = /^([+-])(\d{2})(\d{2})?$/.exec(name)
  if (!numeric) return name
  const [, sign, hours, minutes] = numeric
  return `${sign}${Number(hours)}${minutes && minutes !== "00" ? `:${minutes}` : ""}`
}

/** "Los Angeles, GMT-8": the zone's city and its UTC offset on `date`. */
export function zoneDescription(tzid: string, date: Temporal.PlainDate): string {
  const city = tzid.slice(tzid.lastIndexOf("/") + 1).replaceAll("_", " ")
  const offset = midday(date, tzid).offset // "-08:00"
  const [hours, minutes] = offset.slice(1).split(":")
  return `${city}, GMT${offset[0]}${Number(hours)}${minutes === "00" ? "" : `:${minutes}`}`
}
