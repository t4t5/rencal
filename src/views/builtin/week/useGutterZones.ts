import { useDisplaySettings, useViewerTzid } from "@/sdk"

import { GUTTER_WIDTH } from "./grid"
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

/** The time gutter's width: one GUTTER_WIDTH column per zone. */
export function useGutterWidth(): number {
  return useGutterZones().length * GUTTER_WIDTH
}
