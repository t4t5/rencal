import type { Temporal } from "@js-temporal/polyfill"

import { useDisplaySettings, useViewerTzid } from "@/sdk"

import { type GutterZone, zoneColumnWidth } from "./zones"

/** The gutter's zones from left to right: the extra ones, then the viewer's own beside the days. */
export function useGutterZones(date: Temporal.PlainDate): GutterZone[] {
  const { extraTimeZones, timeFormat } = useDisplaySettings()
  const viewerTzid = useViewerTzid()
  return [
    ...extraTimeZones.map((tzid) => ({ tzid, local: false })),
    { tzid: viewerTzid, local: true },
  ].map((zone) => ({ ...zone, width: zoneColumnWidth(date, viewerTzid, zone.tzid, timeFormat) }))
}

/** The time gutter's width: the sum of its zone columns. */
export function useGutterWidth(date: Temporal.PlainDate): number {
  return useGutterZones(date).reduce((sum, zone) => sum + zone.width, 0)
}
