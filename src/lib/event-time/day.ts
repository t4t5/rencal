import { Temporal } from "@js-temporal/polyfill"

const MILLIS_PER_DAY = 86_400_000

/** A timezone-independent integer key for a calendar day. */
export function epochDay(date: Temporal.PlainDate): number {
  return date.toZonedDateTime("UTC").epochMilliseconds / MILLIS_PER_DAY
}

/** The Monday that begins the week containing the given date. */
export function startOfWeek(date: Temporal.PlainDate): Temporal.PlainDate {
  return date.subtract({ days: date.dayOfWeek - 1 })
}

/** Parse the app's YYYY-MM-DD day-key representation. */
export function dateKeyToPlainDate(key: string): Temporal.PlainDate {
  return Temporal.PlainDate.from(key)
}
