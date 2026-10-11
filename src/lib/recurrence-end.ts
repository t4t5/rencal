import { Temporal } from "@js-temporal/polyfill"

import { eventTzid, getViewerTzid, type EventTime } from "@/lib/event-time"

/**
 * A series' end date lives in its RRULE's UNTIL, whose form must match the
 * series start (RFC 5545, enforced by caldir): a DATE for all-day series, a
 * UTC date-time for zoned ones and a local date-time for floating ones.
 * rrule.js always writes UTC, so these helpers write UNTIL themselves.
 */

const UNTIL_RE = /(?:^|[;:])UNTIL=(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/i
const COUNT_RE = /(?:^|[;:])COUNT=(\d+)/i

type Until = { date: Temporal.PlainDate; time: Temporal.PlainTime | null; utc: boolean }

function parseUntil(rrule: string): Until | null {
  const m = UNTIL_RE.exec(rrule)
  if (!m) return null

  const [, y, mo, d, h, mi, s, z] = m
  return {
    date: new Temporal.PlainDate(Number(y), Number(mo), Number(d)),
    time: h ? new Temporal.PlainTime(Number(h), Number(mi), Number(s)) : null,
    utc: !!z,
  }
}

function compactDate(date: Temporal.PlainDate): string {
  return date.toString().replaceAll("-", "")
}

function compactDateTime(date: Temporal.PlainDate, time: Temporal.PlainTime): string {
  return `${compactDate(date)}T${time.toString().replaceAll(":", "")}`
}

/** The last day the series may occur on, from its UNTIL. */
export function recurrenceEndDate(rrule: string, start: EventTime): Temporal.PlainDate | null {
  const until = parseUntil(rrule)
  if (!until) return null
  if (!until.time || !until.utc) return until.date

  const instant = until.date.toPlainDateTime(until.time).toZonedDateTime("UTC").toInstant()

  switch (start.kind) {
    case "datetime_zoned":
    case "datetime_utc":
      return instant.toZonedDateTimeISO(eventTzid(start)).toPlainDate()
    case "datetime_floating":
      // rrule.js re-serializes a floating UNTIL with a Z; its digits are still local.
      return until.date
    case "date":
      // Likewise a DATE UNTIL comes back as midnight UTC; any other UTC time is
      // a real instant, e.g. left over from before the series became all-day.
      return until.time.equals(Temporal.PlainTime.from("00:00"))
        ? until.date
        : instant.toZonedDateTimeISO(getViewerTzid()).toPlainDate()
  }
}

/** The series' COUNT, if it ends after a number of occurrences. */
export function recurrenceCount(rrule: string): number | null {
  const m = COUNT_RE.exec(rrule)
  return m ? Number(m[1]) : null
}

/** UNTIL covering all of `end`, in the form `start` requires. */
function formatUntil(start: EventTime, end: Temporal.PlainDate): string {
  switch (start.kind) {
    case "date":
      return compactDate(end)
    case "datetime_floating":
      return compactDateTime(end, Temporal.PlainTime.from("23:59:59"))
    case "datetime_zoned":
    case "datetime_utc": {
      const utc = end
        .add({ days: 1 })
        .toZonedDateTime(eventTzid(start))
        .subtract({ seconds: 1 })
        .withTimeZone("UTC")
      return `${compactDateTime(utc.toPlainDate(), utc.toPlainTime())}Z`
    }
  }
}

/**
 * Replace the rule's end (UNTIL or COUNT) so the series runs through `end`,
 * or forever when `end` is null. Takes and returns the RRULE value without
 * the "RRULE:" prefix.
 */
export function withRecurrenceEnd(
  rrule: string,
  start: EventTime,
  end: Temporal.PlainDate | null,
): string {
  const parts = rrule
    .replace(/^RRULE:/i, "")
    .split(";")
    .filter((p) => p && !/^(UNTIL|COUNT)=/i.test(p))
  if (end) parts.push(`UNTIL=${formatUntil(start, end)}`)
  return parts.join(";")
}

/**
 * Rewrite UNTIL into the form `start` requires, e.g. after an all-day toggle
 * or an rrule.js round trip. An UNTIL already in the right form is kept as is,
 * since it may end the series mid-day (as a "this and future" split does).
 */
export function matchUntilToStart(rrule: string, start: EventTime): string {
  const until = parseUntil(rrule)
  if (!until) return rrule

  const matches =
    start.kind === "date"
      ? !until.time
      : start.kind === "datetime_floating"
        ? !!until.time && !until.utc
        : !!until.time && until.utc
  if (matches) return rrule

  return withRecurrenceEnd(rrule, start, recurrenceEndDate(rrule, start))
}
