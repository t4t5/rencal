import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it } from "vitest"

import { dayGaps, instantAt } from "./day-segments"

const at = (iso: string) => Temporal.Instant.from(iso)
const date = (iso: string) => Temporal.PlainDate.from(iso)
const TZ = "Europe/Stockholm"

describe("instantAt", () => {
  it("treats 1440 as the next midnight", () => {
    expect(instantAt(date("2026-11-02"), 1440, TZ).equals(at("2026-11-02T23:00:00Z"))).toBe(true)
    expect(instantAt(date("2026-11-02"), 9 * 60 + 15, TZ).equals(at("2026-11-02T08:15:00Z"))).toBe(
      true,
    )
  })
})

describe("dayGaps", () => {
  it("returns the uncovered parts of the day, merging overlaps", () => {
    const segments = [
      { startMinutes: 13 * 60, endMinutes: 17 * 60 },
      { startMinutes: 9 * 60, endMinutes: 12 * 60 },
      { startMinutes: 11 * 60, endMinutes: 12 * 60 },
    ]
    expect(dayGaps(segments)).toEqual([
      { startMinutes: 0, endMinutes: 9 * 60 },
      { startMinutes: 12 * 60, endMinutes: 13 * 60 },
      { startMinutes: 17 * 60, endMinutes: 24 * 60 },
    ])
  })

  it("covers the whole day when nothing is carved out, and nothing when all of it is", () => {
    expect(dayGaps([])).toEqual([{ startMinutes: 0, endMinutes: 24 * 60 }])
    expect(dayGaps([{ startMinutes: 0, endMinutes: 24 * 60 }])).toEqual([])
  })
})
