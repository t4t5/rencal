import { Temporal } from "@js-temporal/polyfill"

import { formatDuration, MINUTE_UNITS } from "@/lib/duration-query"
import {
  formatShortDate,
  formatWallclockTime,
  type TimeFormat,
  timeZoneName,
} from "@/lib/event-time"

import type { InstantSpan } from "./picked-days"

type ZonedSpan = { start: Temporal.ZonedDateTime; end: Temporal.ZonedDateTime }

function splitAtMidnight({ start, end }: InstantSpan, tzid: string): ZonedSpan[] {
  const last = end.toZonedDateTimeISO(tzid)
  const spans: ZonedSpan[] = []
  let cursor = start.toZonedDateTimeISO(tzid)
  while (Temporal.ZonedDateTime.compare(cursor, last) < 0) {
    const midnight = cursor.add({ days: 1 }).startOfDay()
    const spanEnd = Temporal.ZonedDateTime.compare(last, midnight) < 0 ? last : midnight
    spans.push({ start: cursor, end: spanEnd })
    cursor = spanEnd
  }
  return spans
}

const clock = (time: Temporal.ZonedDateTime, timeFormat: TimeFormat) =>
  formatWallclockTime(time.hour, time.minute, timeFormat)

/** "04:00–05:00", or as you'd say it in 12h: "4–5 AM", "11 AM – 12:30 PM". */
function formatRange({ start, end }: ZonedSpan, timeFormat: TimeFormat): string {
  if (timeFormat === "24h") {
    const endsDay = end.hour === 0 && end.minute === 0
    return `${clock(start, timeFormat)}–${endsDay ? "24:00" : clock(end, timeFormat)}`
  }

  const from = clock(start, timeFormat).replace(":00", "")
  const to = clock(end, timeFormat).replace(":00", "")
  const samePeriod = start.hour < 12 === end.hour < 12
  return samePeriod ? `${from.slice(0, -3)}–${to}` : `${from} – ${to}`
}

const joinOptions = (options: string[]) =>
  options.length < 2 ? options[0] : `${options.slice(0, -1).join(", ")}, or ${options.at(-1)}`

/** A message ready to paste: the question, then a line per day, all in `tzid`. */
export function freeTimesMessage(
  { windows, durationMinutes }: { windows: InstantSpan[]; durationMinutes: number },
  tzid: string,
  timeFormat: TimeFormat,
): string {
  const spans = windows.flatMap((window) => splitAtMidnight(window, tzid))
  const days = Map.groupBy(spans, ({ start }) => formatShortDate(start.toPlainDate()))

  return [
    `Would ${formatDuration(durationMinutes, MINUTE_UNITS)} during any of these times work for you? (all ${timeZoneName(tzid)})`,
    ...[...days].map(([day, daySpans]) => {
      const options = daySpans.map((span) => formatRange(span, timeFormat))
      return `${day}: ${joinOptions(options)}`
    }),
  ].join("\n")
}
