import { Temporal } from "@js-temporal/polyfill"

const MILLIS_PER_DAY = 86_400_000

/** A timezone-independent integer key for a calendar day. */
export function epochDay(date: Temporal.PlainDate): number {
  return date.toZonedDateTime("UTC").epochMilliseconds / MILLIS_PER_DAY
}

/** App-level mirror of the RPC `FirstDayOfWeek` type. */
export type FirstDayOfWeek = "monday" | "sunday"

/** The day that begins the week containing the given date, per `firstDay`. */
export function startOfWeek(
  date: Temporal.PlainDate,
  firstDay: FirstDayOfWeek,
): Temporal.PlainDate {
  // dayOfWeek: Mon=1 … Sun=7.
  const daysSinceWeekStart = firstDay === "sunday" ? date.dayOfWeek % 7 : date.dayOfWeek - 1
  return date.subtract({ days: daysSinceWeekStart })
}

/** Parse the app's YYYY-MM-DD day-key representation. */
export function dateKeyToPlainDate(key: string): Temporal.PlainDate {
  return Temporal.PlainDate.from(key)
}
