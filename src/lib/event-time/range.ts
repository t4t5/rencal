import { Temporal } from "@js-temporal/polyfill"

import { allDayDate } from "./constructors"
import { addDays, addMinutes, dateInEventZone, withEventDate, withWallclockTime } from "./edit"
import { dayOf } from "./layout"
import { getViewerTzid } from "./local-zone"
import {
  dateInViewerZone,
  instantForOrdering,
  isAllDay,
  toViewerZonedDateTime,
} from "./projections"
import type { EventTime, EventTimeRange } from "./types"

/**
 * Ensure an all-day event's [start, end) range is valid: end's day must be at
 * least one day after start's day.
 */
export function normalizeAllDayRange(start: EventTime, end: EventTime): EventTimeRange {
  const needsBump = dayOf(end) <= dayOf(start)
  return { start, end: needsBump ? addDays(start, 1) : end }
}

/**
 * The viewer-local days this event occupies. The end is
 * exclusive, so a timed event ending exactly at midnight does not occupy that
 * new day, and an all-day event stops before its DTEND date.
 */
export function* enumerateLocalDays(
  start: EventTime,
  end: EventTime,
): Generator<Temporal.PlainDate> {
  const firstDate = dateInViewerZone(start)
  let lastDate = dateInViewerZone(end)
  const endIsExclusiveDate =
    isAllDay(start) ||
    toViewerZonedDateTime(end).toPlainTime().equals(Temporal.PlainTime.from("00:00"))

  if (endIsExclusiveDate && Temporal.PlainDate.compare(lastDate, firstDate) > 0) {
    lastDate = lastDate.subtract({ days: 1 })
  }
  if (Temporal.PlainDate.compare(lastDate, firstDate) < 0) {
    lastDate = firstDate
  }

  let current = firstDate
  while (Temporal.PlainDate.compare(current, lastDate) <= 0) {
    yield current
    current = current.add({ days: 1 })
  }
}

/**
 * Whether the event covers the given viewer-local day from midnight to
 * midnight. All-day events cover every day they occupy; a timed event covers
 * a day fully only when its span passes over that day without starting or
 * ending mid-day. Assumes day is occupied by the event (as enumerated by
 * enumerateLocalDays).
 */
export function coversFullDay(start: EventTime, end: EventTime, day: Temporal.PlainDate): boolean {
  if (isAllDay(start)) return true

  const tzid = getViewerTzid()
  const dayStartMs = day.toZonedDateTime(tzid).epochMilliseconds
  const nextDayStartMs = day.add({ days: 1 }).toZonedDateTime(tzid).epochMilliseconds

  return (
    instantForOrdering(start).epochMilliseconds <= dayStartMs &&
    instantForOrdering(end).epochMilliseconds >= nextDayStartMs
  )
}

export function withRangeStartWallclockTime(
  range: EventTimeRange,
  hour: number,
  minute: number,
): EventTimeRange {
  const start = withWallclockTime(range.start, hour, minute)
  const deltaMin = Math.round(
    (instantForOrdering(start).epochMilliseconds -
      instantForOrdering(range.start).epochMilliseconds) /
      60_000,
  )
  const end = isAllDay(range.end) ? range.end : addMinutes(range.end, deltaMin)
  return { start, end }
}

export function withRangeEndWallclockTime(
  range: EventTimeRange,
  hour: number,
  minute: number,
): EventTimeRange {
  let end = withWallclockTime(range.end, hour, minute)
  if (
    !isAllDay(range.start) &&
    instantForOrdering(end).epochMilliseconds < instantForOrdering(range.start).epochMilliseconds
  ) {
    end = addDays(end, 1)
  }
  return { start: range.start, end }
}

export function withRangeStartDate(
  range: EventTimeRange,
  newDate: Temporal.PlainDate,
): EventTimeRange {
  const oldDate = dateInEventZone(range.start)
  const dayDelta = newDate.since(oldDate, { largestUnit: "days" }).days
  return {
    start: withEventDate(range.start, newDate),
    end: addDays(range.end, dayDelta),
  }
}

export function withRangeDisplayEndDate(
  range: EventTimeRange,
  pickedDate: Temporal.PlainDate,
): EventTimeRange {
  if (isAllDay(range.start)) {
    const startDate = dateInEventZone(range.start)
    const clamped = Temporal.PlainDate.compare(pickedDate, startDate) < 0 ? startDate : pickedDate
    return { start: range.start, end: allDayDate(clamped.add({ days: 1 })) }
  }

  return { start: range.start, end: withEventDate(range.end, pickedDate) }
}

export function displayEndDate(range: EventTimeRange): Temporal.PlainDate {
  return dateInEventZone(isAllDay(range.start) ? addDays(range.end, -1) : range.end)
}

export function shouldShowDisplayEndDate(range: EventTimeRange): boolean {
  if (isAllDay(range.start)) return true
  return !dateInEventZone(range.start).equals(dateInEventZone(range.end))
}
