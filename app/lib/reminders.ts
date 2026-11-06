import { DAY_MINUTES, HOUR_MINUTES, MONTH_MINUTES, WEEK_MINUTES } from "@/lib/event-time"

export const DEFAULT_REMINDER_VALUES = [
  0, // At time of event
  10,
  30,
  60,
]

const REMINDER_UNITS = [
  { pattern: /^(m|min|mins|minute|minutes)$/i, toMinutes: (num: number) => num },
  { pattern: /^(h|hr|hrs|hour|hours)$/i, toMinutes: (num: number) => num * HOUR_MINUTES },
  { pattern: /^(d|day|days)$/i, toMinutes: (num: number) => num * DAY_MINUTES },
  { pattern: /^(w|wk|wks|week|weeks)$/i, toMinutes: (num: number) => num * WEEK_MINUTES },
  { pattern: /^(mo|mon|month|months)$/i, toMinutes: (num: number) => num * MONTH_MINUTES },
]

/** What a typed query could mean: "2 h", or "2" as every unit. */
export function reminderQueryValues(query: string): number[] {
  const match = query.trim().match(/^(\d+)\s*([a-z]*)/i)
  if (!match) return []

  const num = parseInt(match[1]!, 10)
  if (num <= 0) return []

  const unitQuery = match[2]
  if (unitQuery) {
    const unit = REMINDER_UNITS.find(({ pattern }) => pattern.test(unitQuery))
    return unit ? [unit.toMinutes(num)] : []
  }

  return [
    ...new Set([
      num,
      num * HOUR_MINUTES,
      num * DAY_MINUTES,
      num * WEEK_MINUTES,
      num * MONTH_MINUTES,
    ]),
  ]
}

export function humanDuration(mins: number): string {
  if (mins === 0) return "At time of event"

  if (mins < 0) {
    // Negative means after the start: an all-day reminder on the day itself.
    const afterMins = -mins
    const h = Math.floor(afterMins / 60)
      .toString()
      .padStart(2, "0")
    const m = (afterMins % 60).toString().padStart(2, "0")
    return `On day of event (${h}:${m})`
  }

  const months = Math.floor(mins / MONTH_MINUTES)
  const weeks = Math.floor((mins % MONTH_MINUTES) / WEEK_MINUTES)
  const days = Math.floor((mins % WEEK_MINUTES) / DAY_MINUTES)
  const hours = Math.floor((mins % DAY_MINUTES) / HOUR_MINUTES)
  const minutes = mins % HOUR_MINUTES

  return [
    { value: months, unit: "month" },
    { value: weeks, unit: "week" },
    { value: days, unit: "day" },
    { value: hours, unit: "hour" },
    { value: minutes, unit: "minute" },
  ]
    .filter(({ value }) => value > 0)
    .map(({ value, unit }) => `${value} ${unit}${value === 1 ? "" : "s"}`)
    .join(", ")
}
