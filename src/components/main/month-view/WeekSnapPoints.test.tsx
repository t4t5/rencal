import { Temporal } from "@js-temporal/polyfill"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"

import { isMonthStartWeek, suppressSnapPointsForFrame, WeekSnapPoints } from "./WeekSnapPoints"

function weeksFrom(start: string, count: number): MonthDay[][] {
  const first = Temporal.PlainDate.from(start)
  return Array.from({ length: count }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const date = first.add({ days: week * 7 + day })
      return { date, dateKey: date.toString(), isToday: false, isWeekend: date.dayOfWeek >= 6 }
    }),
  )
}

describe("isMonthStartWeek", () => {
  it("marks only the week containing the 1st", () => {
    // Mondays: Aug 24, Aug 31 (contains Sep 1), Sep 7
    const [before, boundary, after] = weeksFrom("2026-08-24", 3)
    expect(isMonthStartWeek(before)).toBe(false)
    expect(isMonthStartWeek(boundary)).toBe(true)
    expect(isMonthStartWeek(after)).toBe(false)
  })
})

describe("WeekSnapPoints", () => {
  it("renders one snap-start sentinel per week, one row height apart", () => {
    const html = renderToStaticMarkup(
      <WeekSnapPoints weeks={weeksFrom("2026-09-07", 3)} rowHeight={120} />,
    )
    const sentinels = html.match(/<div[^>]*snap-start[^>]*><\/div>/g) ?? []
    expect(sentinels).toHaveLength(3)
    expect(sentinels.map((s) => s.match(/top:(\d+)px/)?.[1])).toEqual(["0", "120", "240"])
  })

  it("makes month boundary weeks hard stops", () => {
    const html = renderToStaticMarkup(
      <WeekSnapPoints weeks={weeksFrom("2026-08-24", 3)} rowHeight={100} />,
    )
    const sentinels = html.match(/<div[^>]*snap-start[^>]*><\/div>/g) ?? []
    expect(sentinels.map((s) => s.includes("snap-always"))).toEqual([false, true, false])
  })

  it("never takes part in hit testing or layout of the rows", () => {
    const html = renderToStaticMarkup(
      <WeekSnapPoints weeks={weeksFrom("2026-09-07", 1)} rowHeight={100} />,
    )
    expect(html).toContain("pointer-events-none")
    expect(html).toContain("invisible")
    expect(html).toContain('aria-hidden="true"')
  })
})

describe("suppressSnapPointsForFrame", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("hides the snap areas synchronously and restores them next frame", () => {
    let frame: FrameRequestCallback | undefined
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frame = cb
      return 1
    })
    let reflows = 0
    const layer = {
      dataset: {} as DOMStringMap,
      get clientWidth() {
        reflows++
        return 700
      },
    }

    suppressSnapPointsForFrame(layer)

    expect(layer.dataset.snapDisabled).toBe("true")
    expect(reflows).toBe(1)

    frame?.(0)
    expect(layer.dataset.snapDisabled).toBeUndefined()
  })

  it("ignores a missing layer", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn())
    expect(() => suppressSnapPointsForFrame(null)).not.toThrow()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })
})
