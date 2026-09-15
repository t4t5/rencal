import { Temporal } from "@js-temporal/polyfill"

/**
 * A timezone-independent integer key for a calendar day. Pure integer arithmetic
 * (days-from-civil) so the hot per-event paths never touch the polyfill's zone code.
 */
export function epochDay(date: Temporal.PlainDate): number {
  const { year, month, day } = date
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

const datesByEpochDay = new Map<number, Temporal.PlainDate>()
const keysByEpochDay = new Map<number, string>()

/** Inverse of `epochDay`. Cached: the same few thousand days recur across every event list. */
export function plainDateFromEpochDay(epochDayKey: number): Temporal.PlainDate {
  const cached = datesByEpochDay.get(epochDayKey)
  if (cached) return cached

  const z = epochDayKey + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  )
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp < 10 ? mp + 3 : mp - 9
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0)

  const date = new Temporal.PlainDate(year, month, day)
  datesByEpochDay.set(epochDayKey, date)
  return date
}

/** `YYYY-MM-DD` key for an epoch day, cached like `plainDateFromEpochDay`. */
export function dateKeyFromEpochDay(epochDayKey: number): string {
  const cached = keysByEpochDay.get(epochDayKey)
  if (cached !== undefined) return cached

  const key = plainDateFromEpochDay(epochDayKey).toString()
  keysByEpochDay.set(epochDayKey, key)
  return key
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

/**
 * ISO 8601 week number of the displayed week row containing the given date.
 *
 * ISO weeks run Monday–Sunday, so a Sunday-first row straddles two ISO weeks;
 * number the row by its Thursday, which is ISO-correct for Monday-first rows
 * and matches how other calendars label Sunday-first rows.
 */
export function isoWeekNumber(date: Temporal.PlainDate, firstDay: FirstDayOfWeek): number {
  const thursday = startOfWeek(date, firstDay).add({ days: firstDay === "sunday" ? 4 : 3 })
  return thursday.weekOfYear ?? 0
}

/** Parse the app's YYYY-MM-DD day-key representation. */
export function dateKeyToPlainDate(key: string): Temporal.PlainDate {
  return Temporal.PlainDate.from(key)
}
