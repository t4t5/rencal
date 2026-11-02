import { Temporal } from "@js-temporal/polyfill"

import { assignAllDayLanes, clipSpanToRange } from "@/hooks/cal-events/all-day-lanes"
import { layoutTimedOverlaps } from "@/hooks/cal-events/timed-overlaps"
import { DAY_MINUTES, epochDay } from "@/lib/event-time"
import { isSpanning as isAppEventSpanning } from "@/lib/event-utils"

import { type CalendarEvent, toAppEvent } from "./events"

/**
 * Whether an event is drawn as a bar across days rather than at its time: all-day
 * events, and timed events that cross midnight.
 */
export function isSpanning(event: CalendarEvent): boolean {
  return isAppEventSpanning(toAppEvent(event))
}

/** Anything covering whole days, inclusive. Events have both fields. */
export interface DayRange {
  readonly firstDay: Temporal.PlainDate
  readonly lastDay: Temporal.PlainDate
}

/** An item in an all-day lane, in the columns of the days it was laid out in. */
export interface AllDayBar<T> {
  readonly item: T
  /** The first column it covers, from 0. */
  readonly column: number
  /** How many columns it covers. */
  readonly span: number
  /** From 0, top to bottom. */
  readonly lane: number
  /** Whether it starts and ends within the days, rather than continuing past them. */
  readonly isStart: boolean
  readonly isEnd: boolean
}

/**
 * Packs `items` into lanes across the `dayCount` days from `start`, longest
 * first, each in the topmost lane free on all its days. Items outside the days
 * are left out. Lay out each row of a multi-row grid on its own.
 */
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

/** Anything placed by time within one day. Events have both fields. */
export interface TimedRange {
  readonly startMinutes: number
  readonly endMinutes: number
}

/** An item's box in a day column. */
export interface TimedBlock<T> {
  readonly item: T
  /** Percent of the day's height from 00:00 at the top. */
  readonly top: number
  readonly height: number
  /** Share of the column's width left of the item. */
  readonly left: number
  readonly width: number
  /** Share at the right edge drawn over by a neighbour, to keep text clear of. */
  readonly coveredWidth: number
}

/**
 * Lays out one day's timed items, Google Calendar style: items starting together
 * sit side by side, each extending under its right-hand neighbour; items starting
 * later nest on top, indented so the titles beneath stay visible. Returns them in
 * paint order, back to front. An item ending at midnight ends at the bottom; leave
 * events that cross midnight to `layoutAllDay` (`isSpanning`).
 */
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
