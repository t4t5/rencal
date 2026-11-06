import type { Temporal } from "@js-temporal/polyfill"
import { Frequency, RRule, RRuleSet, type Options, type Weekday } from "rrule"

import { allDayDate, dateInEventZone, type EventTime } from "@/lib/event-time"
import { lastDateToUntil, untilToLastDate } from "@/lib/rrule-utils"

/** Repeat units offered by the custom recurrence editor. */
export const RECURRENCE_UNITS = [
  { freq: Frequency.DAILY, singular: "day", plural: "days" },
  { freq: Frequency.WEEKLY, singular: "week", plural: "weeks" },
  { freq: Frequency.MONTHLY, singular: "month", plural: "months" },
  { freq: Frequency.YEARLY, singular: "year", plural: "years" },
] as const

export type RecurrenceUnit = (typeof RECURRENCE_UNITS)[number]["freq"]

export type RecurrenceEnd =
  | { kind: "never" }
  | { kind: "on"; date: Temporal.PlainDate }
  | { kind: "after"; count: number }

/**
 * The state behind "Every [n] [unit]", weekday toggles and the end condition.
 * Weekdays use rrule.js numbering: Monday = 0 … Sunday = 6.
 */
export type CustomRecurrence = {
  freq: RecurrenceUnit
  interval: number
  weekdays: number[]
  end: RecurrenceEnd
}

const WEEKDAYS_MON_TO_FRI = [0, 1, 2, 3, 4]

// Rule parts the editor can show; any other BY* part makes a rule read-only.
const EDITABLE_OPTIONS = new Set(["freq", "interval", "byweekday", "count", "until", "wkst"])

function firstRule(value: RRule | RRuleSet): RRule | undefined {
  return value instanceof RRuleSet ? value.rrules()[0] : value
}

function weekdayList(byweekday: Options["byweekday"] | undefined): (Weekday | number | string)[] {
  if (byweekday == null) return []
  return Array.isArray(byweekday) ? byweekday : [byweekday]
}

function weekdayIndex(day: Weekday | number | string): number {
  if (typeof day === "number") return day
  if (typeof day === "string") return RRule[day as "MO"].weekday
  return day.weekday
}

/** The rule's RRULE line, ignoring any EXDATE/RDATE lines of a set. */
export function ruleString(value: RRule | RRuleSet): string {
  return firstRule(value)?.toString() ?? ""
}

/**
 * Whether the editor can represent the rule without dropping parts of it,
 * e.g. not "the 2nd Tuesday of every month" (BYDAY=2TU) or BYMONTHDAY.
 */
export function isEditableRecurrence(value: RRule | RRuleSet | null): boolean {
  if (!value) return true
  if (value instanceof RRuleSet && (value.rrules().length > 1 || value.exrules().length > 0)) {
    return false
  }
  const rule = firstRule(value)
  if (!rule) return true

  const options = rule.origOptions
  if (!RECURRENCE_UNITS.some((u) => u.freq === options.freq)) return false
  for (const [key, option] of Object.entries(options)) {
    if (option != null && key !== "dtstart" && key !== "tzid" && !EDITABLE_OPTIONS.has(key)) {
      return false
    }
  }

  const days = weekdayList(options.byweekday)
  if (days.length === 0) return true
  return options.freq === Frequency.WEEKLY && days.every((d) => typeof d !== "object" || !d.n)
}

/**
 * Seed the editor from an existing rule. Without explicit weekdays a weekly
 * rule repeats on the event's own day.
 */
export function customRecurrenceFromRule(
  value: RRule | RRuleSet | null,
  start: EventTime,
): CustomRecurrence {
  const options = value ? firstRule(value)?.origOptions : undefined
  const unit = RECURRENCE_UNITS.find((u) => u.freq === options?.freq)
  const days = weekdayList(options?.byweekday)
  // Temporal counts Monday = 1 … Sunday = 7.
  const startWeekday = dateInEventZone(start).dayOfWeek - 1

  return {
    freq: unit?.freq ?? Frequency.WEEKLY,
    interval: Math.max(options?.interval ?? 1, 1),
    weekdays: days.length ? sortWeekdays(days.map(weekdayIndex)) : [startWeekday],
    end: options?.count
      ? { kind: "after", count: options.count }
      : options?.until
        ? { kind: "on", date: untilToLastDate(options.until, start) }
        : { kind: "never" },
  }
}

/**
 * Build the RRULE for the editor state, keeping the week start and, when its
 * end date wasn't changed, the exact UNTIL of the rule being replaced. Weekly
 * rules always spell out their weekdays, since they may not include the
 * event's current day.
 */
export function customRecurrenceToRule(
  recurrence: CustomRecurrence,
  start: EventTime,
  previous: RRule | RRuleSet | null = null,
): RRule {
  const kept = previous ? firstRule(previous)?.origOptions : undefined
  const options: Partial<Options> = { freq: recurrence.freq }

  if (recurrence.interval > 1) options.interval = recurrence.interval
  if (recurrence.freq === Frequency.WEEKLY && recurrence.weekdays.length) {
    options.byweekday = sortWeekdays(recurrence.weekdays)
  }

  const { end } = recurrence
  if (end.kind === "after") options.count = end.count
  if (end.kind === "on") {
    const keepUntil = kept?.until && untilToLastDate(kept.until, start).equals(end.date)
    options.until = keepUntil ? kept.until : lastDateToUntil(end.date, start)
  }
  if (kept?.wkst != null) options.wkst = kept.wkst

  return new RRule(options)
}

/** Toggle a weekday, keeping at least one selected. */
export function toggleWeekday(weekdays: number[], day: number): number[] {
  if (weekdays.length === 1 && weekdays[0] === day) return weekdays
  return weekdays.includes(day)
    ? weekdays.filter((d) => d !== day)
    : sortWeekdays([...weekdays, day])
}

function sortWeekdays(days: number[]): number[] {
  return [...new Set(days)].sort((a, b) => a - b)
}

/** Short label for a rule that isn't one of the presets. */
export function describeRecurrence(value: RRule | RRuleSet, start: EventTime): string {
  const rule = firstRule(value)
  if (!rule) return "Custom recurrence"

  const { freq, interval = 1, byweekday } = rule.origOptions
  const indexes = sortWeekdays(weekdayList(byweekday).map(weekdayIndex))
  if (
    freq === Frequency.WEEKLY &&
    interval === 1 &&
    indexes.join() === WEEKDAYS_MON_TO_FRI.join() &&
    !rule.origOptions.count &&
    !rule.origOptions.until
  ) {
    return "Every weekday"
  }

  // toText prints UNTIL's UTC date, so give it the series' last day in that form.
  const { until } = rule.origOptions
  const lastDate = until && untilToLastDate(until, start)
  const labelled = lastDate
    ? new RRule({ ...rule.origOptions, until: lastDateToUntil(lastDate, allDayDate(lastDate)) })
    : rule
  const text = labelled.toText()
  return text.charAt(0).toUpperCase() + text.slice(1)
}
