import type { CSSProperties } from "react"

import { DAY_MINUTES } from "@/lib/event-time"

import { type DaySegment, dayGaps } from "./day-segments"

// Fixed so stripes line up across blocks instead of restarting in each one.
const UNAVAILABLE: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, color-mix(in oklab, var(--foreground) 8%, transparent) 0 3px, transparent 3px 7px)",
  backgroundAttachment: "fixed",
}

function segmentBox({ startMinutes, endMinutes }: DaySegment): CSSProperties {
  return {
    top: `${(startMinutes / DAY_MINUTES) * 100}%`,
    height: `${((endMinutes - startMinutes) / DAY_MINUTES) * 100}%`,
  }
}

const segmentKey = (s: DaySegment) => `${s.startMinutes}-${s.endMinutes}`

/** Under the events: the whole day hatched, with the picked times carved out. */
export function PickedBackground({
  picked,
  dragging,
}: {
  picked: readonly DaySegment[]
  dragging: DaySegment | null
}) {
  return dayGaps(dragging ? [...picked, dragging] : picked).map((segment) => (
    <div
      key={`unavailable-${segmentKey(segment)}`}
      data-slot="availability-unavailable"
      className="absolute inset-x-0 pointer-events-none"
      style={{ ...segmentBox(segment), ...UNAVAILABLE }}
    />
  ))
}
