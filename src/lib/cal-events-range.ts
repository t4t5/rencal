import { Temporal } from "@js-temporal/polyfill"

import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { epochDay } from "@/lib/event-time"
import { DateRange } from "@/lib/types"

export const MONTHS_TO_LOAD = 2

const compare = Temporal.PlainDate.compare

/**
 * Merge freshly-loaded events into an existing list, dropping any already present
 * (by `eventKey`), in start order. Returns the same array reference when nothing new
 * came in, so callers can skip no-op state updates.
 */
export function mergeEvents(prev: CalendarEvent[], incoming: CalendarEvent[]): CalendarEvent[] {
  const existingKeys = new Set(prev.map(eventKey))
  const added = incoming.filter((e) => {
    const key = eventKey(e)
    if (existingKeys.has(key)) return false
    existingKeys.add(key)
    return true
  })
  if (!added.length) return prev
  return [...prev, ...added].sort((a, b) => a.dateInfo.startMs - b.dateInfo.startMs)
}

export const getStartRangeForDate = (date: Temporal.PlainDate): DateRange => {
  const monthStart = date.with({ day: 1 })
  return {
    start: monthStart.subtract({ months: MONTHS_TO_LOAD }),
    end: monthStart.add({ months: MONTHS_TO_LOAD + 1 }),
  }
}

// Ranges are end-exclusive. The helpers below work on "range sets": sorted, disjoint,
// non-touching lists as returned by `unionRanges`.

/** Sort and merge ranges, joining any that overlap or touch. Drops empty ranges. */
export function unionRanges(ranges: readonly DateRange[]): DateRange[] {
  const sorted = ranges
    .filter((r) => compare(r.start, r.end) < 0)
    .sort((a, b) => compare(a.start, b.start))
  const merged: DateRange[] = []
  for (const range of sorted) {
    const last = merged.at(-1)
    if (last && compare(range.start, last.end) <= 0) {
      if (compare(range.end, last.end) > 0) merged[merged.length - 1] = { ...last, end: range.end }
    } else {
      merged.push(range)
    }
  }
  return merged
}

/** The parts of the range set `ranges` that the range set `covered` doesn't include. */
export function subtractRanges(
  ranges: readonly DateRange[],
  covered: readonly DateRange[],
): DateRange[] {
  const gaps: DateRange[] = []
  for (const range of ranges) {
    let start = range.start
    for (const c of covered) {
      if (compare(c.end, start) <= 0) continue
      if (compare(c.start, range.end) >= 0) break
      if (compare(c.start, start) > 0) gaps.push({ start, end: c.start })
      start = c.end
      if (compare(start, range.end) >= 0) break
    }
    if (compare(start, range.end) < 0) gaps.push({ start, end: range.end })
  }
  return gaps
}

export function eventOverlapsRange(event: CalendarEvent, range: DateRange): boolean {
  return (
    event.dateInfo.lastDay >= epochDay(range.start) && event.dateInfo.firstDay < epochDay(range.end)
  )
}
