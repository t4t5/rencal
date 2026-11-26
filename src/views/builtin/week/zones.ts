import { Temporal } from "@js-temporal/polyfill"

import type { TimeFormat } from "@/sdk"

import { GUTTER_ZONE_WIDTH, GUTTER_ZONE_WIDTH_WIDE } from "./grid"

/** A timezone's column in the time gutter. */
export type GutterZone = {
  tzid: string
  /** The viewer's own zone: the one the grid's days and events are laid out in. */
  local: boolean
  width: number
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

/** A zone's column width: 12-hour labels only show minutes, and need the room, off the hour. */
export function zoneColumnWidth(
  date: Temporal.PlainDate,
  viewerTzid: string,
  tzid: string,
  timeFormat: TimeFormat,
): number {
  const offHour = hourInZone(date, 12, viewerTzid, tzid).minute !== 0
  return timeFormat === "12h" && offHour ? GUTTER_ZONE_WIDTH_WIDE : GUTTER_ZONE_WIDTH
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
