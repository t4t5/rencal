import type { DayHours, TimeRange, Weekday } from "@/lib/api"

export const WEEKDAYS: readonly Weekday[] = ["mo", "tu", "we", "th", "fr", "sa", "su"]

export const DEFAULT_RANGE: TimeRange = { start: "09:00", end: "17:00" }

export type HoursAction =
  | { type: "toggle"; day: Weekday; on: boolean }
  | { type: "add"; day: Weekday }
  | { type: "remove"; day: Weekday; index: number }
  | { type: "set"; day: Weekday; index: number; range: Partial<TimeRange> }
  | { type: "merge"; day: Weekday }
  | { type: "copy"; from: Weekday; to: readonly Weekday[] }

// "HH:MM" strings compare correctly as strings; minutes are for arithmetic.
const toMinutes = (time: string) => {
  const [hour, minute] = time.split(":").map(Number)
  return hour * 60 + minute
}

const fromMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`

/** Every weekday once, Monday first, missing days unavailable. */
export function normalizeHours(hours: readonly DayHours[]): DayHours[] {
  return WEEKDAYS.map((day) => ({
    day,
    ranges: hours.filter((h) => h.day === day).flatMap((h) => h.ranges),
  }))
}

/** Sort and coalesce overlapping or touching ranges; inverted ranges are left for validation. */
export function mergeRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const valid = ranges
    .filter((r) => r.start < r.end)
    .toSorted((a, b) => (a.start < b.start ? -1 : 1))
  const invalid = ranges.filter((r) => r.start >= r.end)
  const merged: TimeRange[] = []
  for (const range of valid) {
    const last = merged.at(-1)
    if (last && range.start <= last.end) {
      if (range.end > last.end) merged[merged.length - 1] = { ...last, end: range.end }
    } else {
      merged.push(range)
    }
  }
  return [...merged, ...invalid]
}

/** An hour after the last range ends, or the default range for an empty day. */
function nextRange(ranges: readonly TimeRange[]): TimeRange | null {
  const last = ranges.at(-1)
  if (!last) return DEFAULT_RANGE
  const start = toMinutes(last.end) + 60
  if (start + 60 > 24 * 60 - 15) return null
  return { start: fromMinutes(start), end: fromMinutes(start + 60) }
}

export function hoursReducer(hours: DayHours[], action: HoursAction): DayHours[] {
  const update = (day: Weekday, fn: (ranges: TimeRange[]) => TimeRange[]) =>
    hours.map((h) => (h.day === day ? { ...h, ranges: fn(h.ranges) } : h))

  switch (action.type) {
    case "toggle":
      return update(action.day, (ranges) =>
        action.on ? (ranges.length ? ranges : [DEFAULT_RANGE]) : [],
      )
    case "add":
      return update(action.day, (ranges) => {
        const next = nextRange(ranges)
        return next ? [...ranges, next] : ranges
      })
    case "remove":
      return update(action.day, (ranges) => ranges.filter((_, i) => i !== action.index))
    case "set":
      return update(action.day, (ranges) =>
        ranges.map((range, i) => (i === action.index ? { ...range, ...action.range } : range)),
      )
    case "merge":
      return update(action.day, mergeRanges)
    case "copy": {
      const source = hours.find((h) => h.day === action.from)?.ranges ?? []
      return hours.map((h) => (action.to.includes(h.day) ? { ...h, ranges: [...source] } : h))
    }
  }
}

/** The first inverted range, for an inline error. */
export function invalidRange(hours: readonly DayHours[]): { day: Weekday; index: number } | null {
  for (const { day, ranges } of hours) {
    const index = ranges.findIndex((r) => r.start >= r.end)
    if (index !== -1) return { day, index }
  }
  return null
}
