import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it } from "vitest"

import { layoutAllDay, layoutTimed } from "./layout"

const date = (day: number) => Temporal.PlainDate.from({ year: 2026, month: 10, day })
const range = (first: number, last: number) => ({ firstDay: date(first), lastDay: date(last) })

describe("layoutAllDay", () => {
  it("clips items to the days and packs them into lanes, longest first", () => {
    const short = range(6, 6)
    const long = range(1, 7)
    const outside = range(20, 21)

    const { bars, laneCount } = layoutAllDay([short, long, outside], date(5), 7)

    expect(laneCount).toBe(2)
    expect(bars).toEqual([
      { item: long, column: 0, span: 3, lane: 0, isStart: false, isEnd: true },
      { item: short, column: 1, span: 1, lane: 1, isStart: true, isEnd: true },
    ])
  })

  it("leaves its input untouched", () => {
    const items = [range(6, 6), range(5, 9)]
    const copy = [...items]
    layoutAllDay(items, date(5), 7)
    expect(items).toEqual(copy)
  })

  it("has no lanes without items", () => {
    expect(layoutAllDay([], date(5), 7)).toEqual({ bars: [], laneCount: 0 })
  })
})

describe("layoutTimed", () => {
  it("places items by time and ends those ending at midnight at the bottom", () => {
    const [block] = layoutTimed([{ startMinutes: 18 * 60, endMinutes: 24 * 60 + 30 }])
    expect(block.top).toBe(75)
    expect(block.height).toBe(25)
  })

  it("puts items starting together side by side, without reordering the input", () => {
    const a = { startMinutes: 600, endMinutes: 660 }
    const b = { startMinutes: 600, endMinutes: 720 }
    const items = [a, b]

    const blocks = layoutTimed(items)

    expect(items).toEqual([a, b])
    expect(blocks.map((block) => block.item)).toEqual([b, a])
    expect(blocks[0].left).toBe(0)
    expect(blocks[1].left).toBeGreaterThan(0)
  })
})
