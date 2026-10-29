import { Temporal } from "@js-temporal/polyfill"

import type { InstantSpan } from "@/lib/api"
import { DAY_MINUTES } from "@/lib/event-time"

export type DaySegment = { startMinutes: number; endMinutes: number }

const startOfDay = (date: Temporal.PlainDate, tzid: string) =>
  date.toZonedDateTime(tzid).toInstant()

const wallclockMinutes = (instant: Temporal.Instant, tzid: string) => {
  const zoned = instant.toZonedDateTimeISO(tzid)
  return zoned.hour * 60 + zoned.minute
}

/** The parts of `spans` on `date` in `tzid`, as wall-clock minutes for the 24-hour grid. */
export function daySegments(
  spans: readonly InstantSpan[],
  date: Temporal.PlainDate,
  tzid: string,
): DaySegment[] {
  const dayStart = startOfDay(date, tzid)
  const dayEnd = startOfDay(date.add({ days: 1 }), tzid)
  const segments: DaySegment[] = []

  for (const span of spans) {
    if (Temporal.Instant.compare(span.end, dayStart) <= 0) continue
    if (Temporal.Instant.compare(span.start, dayEnd) >= 0) continue
    const start = Temporal.Instant.compare(span.start, dayStart) < 0 ? dayStart : span.start
    const endsTomorrow = Temporal.Instant.compare(span.end, dayEnd) >= 0
    const startMinutes = wallclockMinutes(start, tzid)
    const endMinutes = endsTomorrow ? DAY_MINUTES : wallclockMinutes(span.end, tzid)
    // A fall-back hour can run the wall clock backwards; keep the block visible.
    if (endMinutes > startMinutes) segments.push({ startMinutes, endMinutes })
  }

  return segments
}

/** `minutes` past local midnight on `date`, where 1440 is the next midnight. */
export function instantAt(
  date: Temporal.PlainDate,
  minutes: number,
  tzid: string,
): Temporal.Instant {
  if (minutes >= DAY_MINUTES) return startOfDay(date.add({ days: 1 }), tzid)
  return date
    .toPlainDateTime({ hour: Math.floor(minutes / 60), minute: minutes % 60 })
    .toZonedDateTime(tzid)
    .toInstant()
}

/** The instant range a set of days covers in `tzid`, end exclusive. */
export function daysRange(
  first: Temporal.PlainDate,
  last: Temporal.PlainDate,
  tzid: string,
): { from: Temporal.Instant; to: Temporal.Instant } {
  return { from: startOfDay(first, tzid), to: startOfDay(last.add({ days: 1 }), tzid) }
}

/** The parts of the day not covered by `segments`. */
export function dayGaps(segments: readonly DaySegment[]): DaySegment[] {
  const sorted = [...segments].sort((a, b) => a.startMinutes - b.startMinutes)
  const gaps: DaySegment[] = []
  let cursor = 0

  for (const { startMinutes, endMinutes } of sorted) {
    if (startMinutes > cursor) gaps.push({ startMinutes: cursor, endMinutes: startMinutes })
    cursor = Math.max(cursor, endMinutes)
  }
  if (cursor < DAY_MINUTES) gaps.push({ startMinutes: cursor, endMinutes: DAY_MINUTES })

  return gaps
}
