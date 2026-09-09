import type { CSSProperties } from "react"

import type { AllDaySpan } from "@/hooks/cal-events/all-day-lanes"

export const LANE_HEIGHT = 20
export const LANE_GAP = 3

export function allDayBarStyle(span: AllDaySpan, lane: number): CSSProperties {
  return {
    top: `${lane * LANE_HEIGHT}px`,
    height: `${LANE_HEIGHT - LANE_GAP}px`,
    left: `calc(${((span.startCol - 1) / 7) * 100}% + ${span.isStart ? 3 : -2}px)`,
    right: `calc(${((7 - (span.endCol - 1)) / 7) * 100}% + ${span.isEnd ? 4 : -2}px)`,
  }
}
