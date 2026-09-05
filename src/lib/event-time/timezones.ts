import { instantForOrdering } from "./projections"
import type { EventTime } from "./types"

let cachedTimeZones: string[] | undefined

export function listTimeZones(): string[] {
  if (!cachedTimeZones) {
    let zones: string[] = []
    try {
      zones = Intl.supportedValuesOf("timeZone")
    } catch {
      // Callers add known zones when this API is unavailable.
    }
    cachedTimeZones = [...zones.filter((z) => z.includes("/") && !z.startsWith("Etc/")), "UTC"]
  }
  return cachedTimeZones
}

export function timeZoneCity(tzid: string): string {
  return tzid.slice(tzid.lastIndexOf("/") + 1).replaceAll("_", " ")
}

/** Formats the zone's UTC offset at the event instant, accounting for DST. */
export function timeZoneOffsetLabel(tzid: string, at: EventTime): string {
  const offset = instantForOrdering(at).toZonedDateTimeISO(tzid).offset // e.g. "+01:00"
  const sign = offset.startsWith("-") ? "-" : "+"
  const [hours, minutes] = offset.slice(1).split(":")
  return `GMT${sign}${Number(hours)}${minutes === "00" ? "" : `:${minutes}`}`
}
