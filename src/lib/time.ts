// Total milliseconds in a day
export const MS_PER_DAY = 86_400_000

// Total minutes in common duration units
export const HOUR_MINUTES = 60
export const DAY_MINUTES = 24 * HOUR_MINUTES
export const WEEK_MINUTES = 7 * DAY_MINUTES
// App-level reminder months are fixed to 4 weeks, matching the backend cap.
export const MONTH_MINUTES = 4 * WEEK_MINUTES

export function daysDiff(aMs: number, bMs: number): number {
  return Math.round((aMs - bMs) / MS_PER_DAY)
}
