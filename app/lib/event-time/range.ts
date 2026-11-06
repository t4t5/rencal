import { Temporal } from "@js-temporal/polyfill"

import { allDayDate } from "./constructors"
import {
  addDays,
  addMinutes,
  dateInEventZone,
  withEventDate,
  withEventTimeZone,
  withViewerZone,
  withWallclockTime,
} from "./edit"
import { dayOf } from "./layout"
import { instantForOrdering, isAllDay } from "./projections"
import type { EventDateInfo, EventTime, EventTimeRange } from "./types"

/**
 * Ensure an all-day event's [start, end) range is valid: end's day must be at
 * least one day after start's day.
 */
export function normalizeAllDayRange(start: EventTime, end: EventTime): EventTimeRange {
  const needsBump = dayOf(end) <= dayOf(start)
  return { start, end: needsBump ? addDays(start, 1) : end }
}

/**
 * Whether the event covers the given viewer-local day (an epoch-day key) from
 * midnight to midnight. All-day events cover every day they occupy; a timed
 * event covers a day fully only when its span passes over that day without
 * starting or ending mid-day. Assumes the day is one the event occupies (see
 * `occupiedDays`). Works from the cached `dateInfo`, so a start within the
 * first minute after midnight counts as midnight.
 */
export function coversFullDay(start: EventTime, info: EventDateInfo, day: number): boolean {
  if (isAllDay(start)) return true

  const { firstDay, endDay, startLocalMinutes } = info
  const startsByMidnight = firstDay < day || (firstDay === day && startLocalMinutes === 0)
  return startsByMidnight && endDay > day
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

export function withRangeTimeZone(range: EventTimeRange, tzid: string): EventTimeRange {
  return {
    start: withEventTimeZone(range.start, tzid),
    end: withEventTimeZone(range.end, tzid),
  }
}

export function withRangeViewerZone(range: EventTimeRange): EventTimeRange {
  return { start: withViewerZone(range.start), end: withViewerZone(range.end) }
}
