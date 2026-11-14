import { Temporal } from "@js-temporal/polyfill"

import { instantForOrdering } from "./projections"
import type { EventTime } from "./types"

/** How many timezones the time grid shows besides the viewer's (config.toml's `extra_time_zones`). */
export const MAX_EXTRA_TIME_ZONES = 2

function isTimeZone(tzid: string): boolean {
  try {
    Temporal.Now.zonedDateTimeISO(tzid)
    return true
  } catch {
    return false
  }
}

/** The stored extra zones the grid can show: known IANA ids, once each, at most MAX_EXTRA_TIME_ZONES. */
export function normalizeExtraTimeZones(zones: readonly string[]): string[] {
  const known = zones.filter((tzid) => typeof tzid === "string" && isTimeZone(tzid))
  return [...new Set(known)].slice(0, MAX_EXTRA_TIME_ZONES)
}

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
