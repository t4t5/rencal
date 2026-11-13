import { Temporal } from "@js-temporal/polyfill"

import { describe, expect, it } from "@/lib/testing/vitest"

import { layoutTimed } from "./index"

const date = (day: number) => Temporal.PlainDate.from({ year: 2026, month: 1, day })

describe("layoutTimed", () => {
  it("lays out an item crossing midnight on each day it touches, given the day", () => {
    const item = { startMinutes: 22 * 60, endMinutes: 24 * 60 + 6 * 60, firstDay: date(5) }

    const [first] = layoutTimed([item], date(5))
    expect(first!.top).toBe((22 / 24) * 100)
    expect(first!.height).toBe((2 / 24) * 100)

    const [next] = layoutTimed([item], date(6))
    expect(next!.top).toBe(0)
    expect(next!.height).toBe(25)
  })
})
