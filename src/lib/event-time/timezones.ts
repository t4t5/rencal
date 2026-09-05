import { instantForOrdering } from "./projections"
import type { EventTime } from "./types"

let cachedTimeZones: string[] | undefined

/**
 * Every IANA zone the engine knows, as "Area/City" ids plus "UTC". Cached
 * after the first call; the list is static for the life of the process.
 */
export function listTimeZones(): string[] {
  if (!cachedTimeZones) {
    let zones: string[] = []
    try {
      zones = Intl.supportedValuesOf("timeZone")
    } catch {
      // Older engines: callers add the zones they already know about.
    }
    cachedTimeZones = [...zones.filter((z) => z.includes("/") && !z.startsWith("Etc/")), "UTC"]
  }
  return cachedTimeZones
}

/** "Europe/London" → "London", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function timeZoneCity(tzid: string): string {
  return tzid.slice(tzid.lastIndexOf("/") + 1).replaceAll("_", " ")
}

/**
 * The zone's UTC offset at the event's instant, e.g. "GMT+1", "GMT-3",
 * "GMT+5:30". Evaluated at the event rather than at "now" so DST is right for
 * the event's date.
 */
export function timeZoneOffsetLabel(tzid: string, at: EventTime): string {
  const offset = instantForOrdering(at).toZonedDateTimeISO(tzid).offset // e.g. "+01:00"
  const sign = offset.startsWith("-") ? "-" : "+"
  const [hours, minutes] = offset.slice(1).split(":")
  return `GMT${sign}${Number(hours)}${minutes === "00" ? "" : `:${minutes}`}`
}
