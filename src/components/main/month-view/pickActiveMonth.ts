import { Temporal } from "@js-temporal/polyfill"

import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"

/** The slice of a tanstack-virtual item that pickActiveMonth needs. */
export type ActiveMonthVirtualItem = {
  index: number
  start: number
  end: number
  size: number
}

function monthKey(date: Temporal.PlainDate): string {
  return date.toString().slice(0, 7)
}

/**
 * Decide which date the active date should follow to as the user scrolls the month grid.
 *
 * Implements the scroll-follow rule from docs/scroll-behaviour.md: the active date jumps
 * to the 1st of whichever month currently fills the most of the viewport, but only once
 * that month's first-of-month week is fully visible. Ties keep the current month
 * (hysteresis), and the move must agree with the scroll direction so momentum scrolling
 * can't overshoot into the wrong month.
 *
 * Pure: returns the date to set active, or null to leave it unchanged.
 */
export function pickActiveMonth({
  virtualItems,
  weeks,
  viewTop,
  viewBottom,
  activeDate,
  direction,
}: {
  virtualItems: ActiveMonthVirtualItem[]
  weeks: MonthDay[][]
  viewTop: number
  viewBottom: number
  activeDate: Temporal.PlainDate
  direction: "up" | "down"
}): Temporal.PlainDate | null {
  // Fractional visible area per month, plus each month's 1st when it's on screen. We only
  // commit to a month once its 1st is visible, so both scroll directions land on day 1.
  const monthArea = new Map<string, number>()
  const monthFirstDay = new Map<string, Temporal.PlainDate>()

  for (const item of virtualItems) {
    const top = Math.max(item.start, viewTop)
    const bottom = Math.min(item.end, viewBottom)
    if (bottom <= top) continue
    const fraction = (bottom - top) / item.size
    const week = weeks[item.index]
    if (!week) continue
    for (const day of week) {
      const key = monthKey(day.date)
      monthArea.set(key, (monthArea.get(key) ?? 0) + fraction)
      if (day.date.day === 1) monthFirstDay.set(key, day.date)
    }
  }

  // Most-visible month, staying on the active month unless another is strictly larger.
  const activeKey = monthKey(activeDate)
  let bestKey = activeKey
  let bestArea = monthArea.get(activeKey) ?? 0
  for (const [key, area] of monthArea) {
    if (area > bestArea) {
      bestKey = key
      bestArea = area
    }
  }
  if (bestKey === activeKey) return null

  const target = monthFirstDay.get(bestKey)
  if (!target) return null

  // Don't promote a half-clipped 1st-of-month row, and don't move against the scroll.
  const targetComparison = Temporal.PlainDate.compare(target, activeDate)
  if (direction === "up" && targetComparison > 0) return null
  if (direction === "down" && targetComparison < 0) return null

  const targetItem = virtualItems.find((item) =>
    weeks[item.index]?.some((day) => day.date.equals(target)),
  )
  if (!targetItem || targetItem.start < viewTop || targetItem.end > viewBottom) return null

  return target
}
