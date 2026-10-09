import { Temporal } from "@js-temporal/polyfill"
import { plural, selectOrdinal, t } from "@lingui/core/macro"
import { Frequency, type Options, RRule, Weekday } from "rrule"

import { formatDayMonth, formatList, weekdayNames } from "@/lib/event-time"

/**
 * Describes a recurrence rule in the active UI language, e.g. "Every 2 weeks
 * on Tuesday" / "Alle 2 Wochen am Dienstag". Covers interval, weekdays, the
 * nth weekday of the month, days of the month, COUNT and UNTIL. Returns null
 * for anything else (BYSETPOS, BYMONTH, hourly…) so the caller can fall back
 * instead of showing a description that leaves part of the rule out.
 */
export function describeRecurrence(rule: RRule): string | null {
  const o = rule.origOptions
  if (hasUnsupportedParts(o)) return null

  const interval = o.interval ?? 1
  const weekdays = toWeekdays(o.byweekday)
  const monthDays = toNumbers(o.bymonthday)

  let description: string | null
  switch (o.freq) {
    case Frequency.DAILY:
      description = weekdays || monthDays ? null : everyDays(interval)
      break
    case Frequency.WEEKLY:
      description = monthDays ? null : describeWeekly(interval, weekdays)
      break
    case Frequency.MONTHLY:
      description = describeMonthly(interval, weekdays, monthDays)
      break
    case Frequency.YEARLY:
      description = weekdays || monthDays ? null : everyYears(interval)
      break
    default:
      description = null
  }
  if (!description) return null

  if (o.count) {
    const count = o.count
    description = t({
      message: `${description}, ${plural(count, { one: "# time", other: "# times" })}`,
      context: "recurrence count",
    })
  }
  if (o.until) {
    const date = formatDayMonth(untilDate(o.until))
    description = t({ message: `${description} until ${date}`, context: "recurrence end" })
  }
  return description
}

const SUPPORTED_KEYS = new Set<keyof Options>([
  "freq",
  "interval",
  "byweekday",
  "bymonthday",
  "count",
  "until",
  "dtstart",
  "tzid",
  "wkst",
])

function hasUnsupportedParts(o: Partial<Options>): boolean {
  return Object.entries(o).some(
    ([key, value]) => value != null && !SUPPORTED_KEYS.has(key as keyof Options),
  )
}

function everyDays(n: number): string {
  return plural(n, { one: "Every day", other: "Every # days" })
}

function everyWeeks(n: number): string {
  return plural(n, { one: "Every week", other: "Every # weeks" })
}

function everyMonths(n: number): string {
  return plural(n, { one: "Every month", other: "Every # months" })
}

function everyYears(n: number): string {
  return plural(n, { one: "Every year", other: "Every # years" })
}

function describeWeekly(interval: number, weekdays: Weekday[] | null): string | null {
  const base = everyWeeks(interval)
  if (!weekdays) return base
  if (weekdays.some((w) => w.n)) return null
  const days = weekdays.map((w) => w.weekday).sort()
  if (interval === 1 && days.join() === "0,1,2,3,4") return t`Every weekday`
  const names = formatList(days.map((d) => weekdayNames("long")[d]))
  return t({ message: `${base} on ${names}`, context: "weekly recurrence" })
}

function describeMonthly(
  interval: number,
  weekdays: Weekday[] | null,
  monthDays: number[] | null,
): string | null {
  const base = everyMonths(interval)
  if (weekdays && monthDays) return null

  if (monthDays) {
    if (monthDays.some((d) => d < 1)) return null
    const days = formatList(monthDays.map(ordinalDay))
    return t({ message: `${base} on the ${days}`, context: "monthly recurrence by day" })
  }

  if (weekdays) {
    if (weekdays.length !== 1) return null
    const { weekday, n } = weekdays[0]
    const weekdayName = weekdayNames("long")[weekday]
    if (n === -1) {
      return t({ message: `${base} on the last ${weekdayName}`, context: "monthly recurrence" })
    }
    if (!n || n < 1 || n > 5) return null
    const position = ordinalDay(n)
    return t({
      message: `${base} on the ${position} ${weekdayName}`,
      context: "monthly recurrence",
    })
  }

  return base
}

function ordinalDay(n: number): string {
  return selectOrdinal(n, { one: "#st", two: "#nd", few: "#rd", other: "#th" })
}

function toWeekdays(value: Options["byweekday"] | undefined): Weekday[] | null {
  if (value == null) return null
  const list = Array.isArray(value) ? value : [value]
  if (list.length === 0) return null
  return list.map((w) =>
    w instanceof Weekday ? w : typeof w === "number" ? new Weekday(w) : Weekday.fromStr(w),
  )
}

function toNumbers(value: number | number[] | null | undefined): number[] | null {
  if (value == null) return null
  const list = Array.isArray(value) ? value : [value]
  return list.length > 0 ? list : null
}

// rrule keeps UNTIL as a UTC Date; its calendar date is what the user picked.
function untilDate(until: Date): Temporal.PlainDate {
  return Temporal.PlainDate.from({
    year: until.getUTCFullYear(),
    month: until.getUTCMonth() + 1,
    day: until.getUTCDate(),
  })
}
