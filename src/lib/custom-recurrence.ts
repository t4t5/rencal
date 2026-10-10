import { Frequency, RRule, RRuleSet, type Options, type Weekday } from "rrule"

/** Repeat units offered by the custom recurrence editor. */
export const RECURRENCE_UNITS = [
  { freq: Frequency.DAILY, singular: "day", plural: "days" },
  { freq: Frequency.WEEKLY, singular: "week", plural: "weeks" },
  { freq: Frequency.MONTHLY, singular: "month", plural: "months" },
  { freq: Frequency.YEARLY, singular: "year", plural: "years" },
] as const

export type RecurrenceUnit = (typeof RECURRENCE_UNITS)[number]["freq"]

/**
 * The state behind "Every [n] [unit]" plus weekday toggles.
 * Weekdays use rrule.js numbering: Monday = 0 … Sunday = 6.
 */
export type CustomRecurrence = {
  freq: RecurrenceUnit
  interval: number
  weekdays: number[]
}

const WEEKDAYS_MON_TO_FRI = [0, 1, 2, 3, 4]

function firstRule(value: RRule | RRuleSet): RRule | undefined {
  return value instanceof RRuleSet ? value.rrules()[0] : value
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
 * Seed the editor from an existing rule. `startWeekday` is the event's own
 * day, which is always part of a weekly series (see `toggleWeekday`).
 */
export function customRecurrenceFromRule(
  value: RRule | RRuleSet | null,
  startWeekday: number,
): CustomRecurrence {
  const options = value ? firstRule(value)?.origOptions : undefined
  const unit = RECURRENCE_UNITS.find((u) => u.freq === options?.freq)
  const byweekday = options?.byweekday
  const days = byweekday == null ? [] : Array.isArray(byweekday) ? byweekday : [byweekday]

  return {
    freq: unit?.freq ?? Frequency.WEEKLY,
    interval: Math.max(options?.interval ?? 1, 1),
    weekdays: sortWeekdays([startWeekday, ...days.map(weekdayIndex)]),
  }
}

/**
 * Build the RRULE for the editor state, keeping the end condition (COUNT/UNTIL)
 * and week start of the rule being replaced. Weekdays only apply to weekly
 * rules, and a lone start weekday is left implicit so plain weekly series
 * still match the "Every week" / "Every 2 weeks" presets.
 */
export function customRecurrenceToRule(
  recurrence: CustomRecurrence,
  previous: RRule | RRuleSet | null = null,
): RRule {
  const kept = previous ? firstRule(previous)?.origOptions : undefined
  const options: Partial<Options> = { freq: recurrence.freq }

  if (recurrence.interval > 1) options.interval = recurrence.interval
  if (recurrence.freq === Frequency.WEEKLY && recurrence.weekdays.length > 1) {
    options.byweekday = sortWeekdays(recurrence.weekdays)
  }
  if (kept?.count != null) options.count = kept.count
  if (kept?.until != null) options.until = kept.until
  if (kept?.wkst != null) options.wkst = kept.wkst

  return new RRule(options)
}

/**
 * Toggle a weekday, never removing the event's own day: RFC 5545 leaves a
 * DTSTART that doesn't match its rule undefined.
 */
export function toggleWeekday(weekdays: number[], day: number, startWeekday: number): number[] {
  if (day === startWeekday) return weekdays
  return weekdays.includes(day)
    ? weekdays.filter((d) => d !== day)
    : sortWeekdays([...weekdays, day])
}

function sortWeekdays(days: number[]): number[] {
  return [...new Set(days)].sort((a, b) => a - b)
}

/** Short label for a rule that isn't one of the presets. */
export function describeRecurrence(value: RRule | RRuleSet): string {
  const rule = firstRule(value)
  if (!rule) return "Custom recurrence"

  const { freq, interval = 1, byweekday } = rule.origOptions
  const days = byweekday == null ? [] : Array.isArray(byweekday) ? byweekday : [byweekday]
  const indexes = sortWeekdays(days.map(weekdayIndex))
  if (
    freq === Frequency.WEEKLY &&
    interval === 1 &&
    indexes.join() === WEEKDAYS_MON_TO_FRI.join() &&
    !rule.origOptions.count &&
    !rule.origOptions.until
  ) {
    return "Every weekday"
  }

  const text = rule.toText()
  return text.charAt(0).toUpperCase() + text.slice(1)
}
