import { addDays, startOfWeek } from "date-fns"
import { describe, expect, it } from "vitest"

import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { formatDateKey } from "@/lib/event-time"

import { pickActiveMonth, type ActiveMonthVirtualItem } from "./pickActiveMonth"

const ROW = 100

// Weeks starting from the Monday of `startMonday`'s week, mirroring useMonthGrid.
function buildWeeks(startMonday: Date, numWeeks: number): MonthDay[][] {
  const mon = startOfWeek(startMonday, { weekStartsOn: 1 })
  return Array.from({ length: numWeeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(mon, w * 7 + d)
      return {
        date,
        dateKey: formatDateKey(date),
        isToday: false,
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      }
    }),
  )
}

function items(numWeeks: number): ActiveMonthVirtualItem[] {
  return Array.from({ length: numWeeks }, (_, i) => ({
    index: i,
    start: i * ROW,
    end: i * ROW + ROW,
    size: ROW,
  }))
}

// Jan 19 2026 is a Monday. week0 = Jan19–25 (all Jan), week1 = Jan26–Feb1 (Feb 1 is Sun),
// week2 = Feb2–8, week3 = Feb9–15, week4 = Feb16–22.
const weeks = buildWeeks(new Date(2026, 0, 19), 5)
const virtualItems = items(5)

describe("pickActiveMonth", () => {
  it("commits to the 1st of the next month when it dominates and its week is fully visible", () => {
    // Viewport over weeks 1–3: week1 (with Feb 1) fully visible, Feb dominant.
    const result = pickActiveMonth({
      virtualItems,
      weeks,
      viewTop: 100,
      viewBottom: 400,
      activeDateKey: "2026-01-15",
      direction: "down",
    })
    expect(result && formatDateKey(result)).toBe("2026-02-01")
  })

  it("does not switch while scrolling within a month (no 1st on screen)", () => {
    // Viewport over weeks 2–4: all February, but Feb 1 (week1) is off screen.
    const result = pickActiveMonth({
      virtualItems,
      weeks,
      viewTop: 200,
      viewBottom: 500,
      activeDateKey: "2026-02-10",
      direction: "down",
    })
    expect(result).toBeNull()
  })

  it("waits until the target's 1st-of-month week is fully visible", () => {
    // Same dominant-February viewport, but shifted down so week1 is clipped at the top.
    const result = pickActiveMonth({
      virtualItems,
      weeks,
      viewTop: 120,
      viewBottom: 420,
      activeDateKey: "2026-01-15",
      direction: "down",
    })
    expect(result).toBeNull()
  })

  it("does not move against the scroll direction", () => {
    // Feb would dominate, but the user is scrolling up (toward earlier dates).
    const result = pickActiveMonth({
      virtualItems,
      weeks,
      viewTop: 100,
      viewBottom: 400,
      activeDateKey: "2026-01-15",
      direction: "up",
    })
    expect(result).toBeNull()
  })
})
