import type { CSSProperties } from "react"

import type { AllDaySpan } from "@/hooks/cal-events/all-day-lanes"

export const LANE_GAP = 3

const INSET = "var(--month-padding-inline)"

export function allDayBarStyle(span: AllDaySpan, lane: number): CSSProperties {
  return {
    top: `calc(var(--lane-height) * ${lane})`,
    height: `calc(var(--lane-height) - ${LANE_GAP}px)`,
    left: `calc(${((span.startCol - 1) / 7) * 100}% + ${span.isStart ? INSET : "-2px"})`,
    right: `calc(${((7 - (span.endCol - 1)) / 7) * 100}% + ${span.isEnd ? INSET : "-2px"})`,
  }
}

export function reservedAllDayHeight(lanes: number): string | null {
  return lanes > 0 ? `calc(var(--lane-height) * ${lanes} - ${LANE_GAP}px)` : null
}
