import { DAY_MINUTES, HOUR_MINUTES, MONTH_MINUTES, WEEK_MINUTES } from "@/lib/event-time"

/** A unit a typed duration can use, sized in the caller's base unit. */
export type DurationUnit = { name: string; pattern: RegExp; size: number }

export const MINUTE_UNITS: DurationUnit[] = [
  { name: "minute", pattern: /^(m|min|mins|minute|minutes)$/i, size: 1 },
  { name: "hour", pattern: /^(h|hr|hrs|hour|hours)$/i, size: HOUR_MINUTES },
  { name: "day", pattern: /^(d|day|days)$/i, size: DAY_MINUTES },
  { name: "week", pattern: /^(w|wk|wks|week|weeks)$/i, size: WEEK_MINUTES },
  { name: "month", pattern: /^(mo|mon|month|months)$/i, size: MONTH_MINUTES },
]

/**
 * What a query like "2", "2h" or "2 days" could mean, in the base unit. A bare
 * number offers every unit.
 */
export function durationQueryValues(query: string, units: DurationUnit[]): number[] {
  const match = query.trim().match(/^(\d+)\s*([a-z]*)/i)
  if (!match) return []

  const num = parseInt(match[1], 10)
  if (num <= 0) return []

  const unitQuery = match[2]
  if (unitQuery) {
    const unit = units.find(({ pattern }) => pattern.test(unitQuery))
    return unit ? [num * unit.size] : []
  }

  return [...new Set(units.map((unit) => num * unit.size))]
}

/** e.g. "1 day, 4 hours", largest unit first. */
export function formatDuration(value: number, units: DurationUnit[]): string {
  let rest = value
  return [...units]
    .sort((a, b) => b.size - a.size)
    .map((unit) => {
      const count = Math.floor(rest / unit.size)
      rest %= unit.size
      return { count, name: unit.name }
    })
    .filter(({ count }) => count > 0)
    .map(({ count, name }) => `${count} ${name}${count === 1 ? "" : "s"}`)
    .join(", ")
}
