import { Temporal } from "@js-temporal/polyfill"

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

const midday = (date: Temporal.PlainDate, tzid: string) =>
  date.toZonedDateTime({ timeZone: tzid, plainTime: new Temporal.PlainTime(12) })

/** The zone's short name on `date`, like "PST" or "GMT+1": it changes with daylight saving. */
export function zoneAbbreviation(tzid: string, date: Temporal.PlainDate): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tzid,
    timeZoneName: "short",
  }).formatToParts(midday(date, tzid).epochMilliseconds)
  return parts.find((part) => part.type === "timeZoneName")?.value ?? tzid
}

/** "Los Angeles, GMT-8": the zone's city and its UTC offset on `date`. */
export function zoneDescription(tzid: string, date: Temporal.PlainDate): string {
  const city = tzid.slice(tzid.lastIndexOf("/") + 1).replaceAll("_", " ")
  const offset = midday(date, tzid).offset // "-08:00"
  const [hours, minutes] = offset.slice(1).split(":")
  return `${city}, GMT${offset[0]}${Number(hours)}${minutes === "00" ? "" : `:${minutes}`}`
}
