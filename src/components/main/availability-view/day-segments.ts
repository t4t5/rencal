import { Temporal } from "@js-temporal/polyfill"

import { DAY_MINUTES } from "@/lib/event-time"

export type DaySegment = { startMinutes: number; endMinutes: number }

/** `minutes` past local midnight on `date`, where 1440 is the next midnight. */
export function instantAt(
  date: Temporal.PlainDate,
  minutes: number,
  tzid: string,
): Temporal.Instant {
  if (minutes >= DAY_MINUTES) return date.add({ days: 1 }).toZonedDateTime(tzid).toInstant()
  return date
    .toPlainDateTime({ hour: Math.floor(minutes / 60), minute: minutes % 60 })
    .toZonedDateTime(tzid)
    .toInstant()
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
