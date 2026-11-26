import { useDisplaySettings, useViewerTzid } from "@/sdk"

import { GUTTER_ZONE_WIDTH } from "./grid"
import type { GutterZone } from "./zones"

/** The gutter's zones from left to right: the extra ones, then the viewer's own beside the days. */
export function useGutterZones(): GutterZone[] {
  const { extraTimeZones } = useDisplaySettings()
  const viewerTzid = useViewerTzid()
  return [
    ...extraTimeZones.map((tzid) => ({ tzid, local: false })),
    { tzid: viewerTzid, local: true },
  ]
}

/** One zone column's width for the current time format. */
export function useGutterZoneWidth(): number {
  return GUTTER_ZONE_WIDTH[useDisplaySettings().timeFormat]
}

/** The time gutter's width: one column per zone. */
export function useGutterWidth(): number {
  return useGutterZones().length * useGutterZoneWidth()
}
