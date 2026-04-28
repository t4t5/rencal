// Total milliseconds in a day
export const MS_PER_DAY = 86_400_000

// Total minutes in a day
export const DAY_MINUTES = 24 * 60

export function daysDiff(aMs: number, bMs: number): number {
  return Math.round((aMs - bMs) / MS_PER_DAY)
}
