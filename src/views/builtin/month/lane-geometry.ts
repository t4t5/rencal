import type { CSSProperties } from "react"

import type { AllDayBar } from "@/sdk"

export const LANE_GAP = 3

const INSET = "var(--month-padding-inline)"

export function allDayBarStyle(bar: AllDayBar<unknown>): CSSProperties {
  return {
    top: `calc(var(--lane-height) * ${bar.lane})`,
    height: `calc(var(--lane-height) - ${LANE_GAP}px)`,
    left: `calc(${(bar.column / 7) * 100}% + ${bar.isStart ? INSET : "-2px"})`,
    right: `calc(${((7 - bar.column - bar.span) / 7) * 100}% + ${bar.isEnd ? INSET : "-2px"})`,
  }
}

export function reservedAllDayHeight(lanes: number): string | null {
  return lanes > 0 ? `calc(var(--lane-height) * ${lanes} - ${LANE_GAP}px)` : null
}
