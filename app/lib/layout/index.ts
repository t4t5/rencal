/* Where events sit in the grids, from `src/sdk/layout.ts`. */
import { Temporal } from "@js-temporal/polyfill"

import { DAY_MINUTES, epochDay } from "@/lib/event-time"

import { assignAllDayLanes, clipSpanToRange } from "./all-day-lanes"
import { layoutTimedOverlaps } from "./timed-overlaps"

/** Anything covering whole days, inclusive. */
export interface DayRange {
  readonly firstDay: Temporal.PlainDate
  readonly lastDay: Temporal.PlainDate
}

/** An item in an all-day lane, in the columns of the days it was laid out in. */
export interface AllDayBar<T> {
  readonly item: T
  readonly column: number
  readonly span: number
  readonly lane: number
  readonly isStart: boolean
  readonly isEnd: boolean
}

export function layoutAllDay<T extends DayRange>(
  items: readonly T[],
  start: Temporal.PlainDate,
  dayCount: number,
): { bars: AllDayBar<T>[]; laneCount: number } {
  const first = epochDay(start)
  const last = first + dayCount - 1
  const spans = items.flatMap((item) => {
    const span = clipSpanToRange(epochDay(item.firstDay), epochDay(item.lastDay), first, last)
    return span ? [{ ...span, item, lane: 0 }] : []
  })
  const laneCount = assignAllDayLanes(spans, dayCount) + 1

  return {
    bars: spans.map(({ item, startCol, endCol, lane, isStart, isEnd }) => ({
      item,
      column: startCol - 1,
      span: endCol - startCol,
      lane,
      isStart,
      isEnd,
    })),
    laneCount,
  }
}

export interface TimedRange {
  readonly startMinutes: number
  readonly endMinutes: number
}

export interface TimedBlock<T> {
  readonly item: T
  readonly top: number
  readonly height: number
  readonly left: number
  readonly width: number
  readonly coveredWidth: number
}

export function layoutTimed<T extends TimedRange>(items: readonly T[]): TimedBlock<T>[] {
  const blocks = items.map((item) => ({
    item,
    top: (item.startMinutes / DAY_MINUTES) * 100,
    height: ((Math.min(item.endMinutes, DAY_MINUTES) - item.startMinutes) / DAY_MINUTES) * 100,
    left: 0,
    width: 1,
    coveredWidth: 0,
  }))
  layoutTimedOverlaps(blocks)
  return blocks
}
