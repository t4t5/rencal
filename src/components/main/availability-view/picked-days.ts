import { Temporal } from "@js-temporal/polyfill"

import { DAY_MINUTES } from "@/lib/event-time"

import { type DaySegment, instantAt } from "./day-segments"

export const TIME_STEP_MINUTES = 15
export const LAST_START_MINUTES = DAY_MINUTES - TIME_STEP_MINUTES
export const DEFAULT_RANGE: DaySegment = { startMinutes: 9 * 60, endMinutes: 17 * 60 }

/** A date in the list, which goes when its last range does. */
export type PickedDay = {
  date: Temporal.PlainDate
  ranges: DaySegment[]
}

export type InstantSpan = { start: Temporal.Instant; end: Temporal.Instant }

/** Sort and coalesce overlapping or touching ranges. */
function mergeRanges(ranges: readonly DaySegment[]): DaySegment[] {
  const merged: DaySegment[] = []
  for (const range of ranges.toSorted((a, b) => a.startMinutes - b.startMinutes)) {
    const last = merged.at(-1)
    if (last && range.startMinutes <= last.endMinutes) {
      last.endMinutes = Math.max(last.endMinutes, range.endMinutes)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

function updateDay(
  days: readonly PickedDay[],
  date: Temporal.PlainDate,
  update: (day: PickedDay) => PickedDay,
): PickedDay[] {
  return days.map((day) => (day.date.equals(date) ? update(day) : day))
}

/** Add to a date, or start a new one. */
export function addRange(
  days: readonly PickedDay[],
  date: Temporal.PlainDate,
  range: DaySegment,
): PickedDay[] {
  if (!days.some((day) => day.date.equals(date))) {
    return [...days, { date, ranges: [range] }].toSorted((a, b) =>
      Temporal.PlainDate.compare(a.date, b.date),
    )
  }
  return updateDay(days, date, (day) => ({
    ...day,
    ranges: mergeRanges([...day.ranges, range]),
  }))
}

export function setRange(
  days: readonly PickedDay[],
  date: Temporal.PlainDate,
  index: number,
  range: DaySegment,
): PickedDay[] {
  return updateDay(days, date, (day) => ({
    ...day,
    ranges: mergeRanges(day.ranges.map((other, i) => (i === index ? range : other))),
  }))
}

export function removeRange(
  days: readonly PickedDay[],
  date: Temporal.PlainDate,
  index: number,
): PickedDay[] {
  return updateDay(days, date, (day) => ({
    ...day,
    ranges: day.ranges.filter((_, i) => i !== index),
  })).filter((day) => day.ranges.length > 0)
}

/** The day after the last date, or today when there's nothing from today on. */
export function nextDate(
  days: readonly PickedDay[],
  today: Temporal.PlainDate,
): Temporal.PlainDate {
  const next = days.at(-1)?.date.add({ days: 1 })
  return next && Temporal.PlainDate.compare(next, today) > 0 ? next : today
}

/** A meeting's length from `startMinutes`, stopping at midnight. */
export function rangeFrom(startMinutes: number, durationMinutes: number): DaySegment {
  return { startMinutes, endMinutes: Math.min(startMinutes + durationMinutes, DAY_MINUTES) }
}

/** An hour after the last range ends, or null when that's past the end of the day. */
export function nextRange(
  ranges: readonly DaySegment[],
  durationMinutes: number,
): DaySegment | null {
  const start = (ranges.at(-1)?.endMinutes ?? 0) + 60
  return start < DAY_MINUTES ? rangeFrom(start, durationMinutes) : null
}

/** What goes in the message: every range, as instants. */
export function offeredSpans(days: readonly PickedDay[], tzid: string): InstantSpan[] {
  return days.flatMap((day) =>
    day.ranges.map((range) => ({
      start: instantAt(day.date, range.startMinutes, tzid),
      end: instantAt(day.date, range.endMinutes, tzid),
    })),
  )
}
