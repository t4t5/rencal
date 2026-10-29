import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it } from "vitest"

import { daySegments, instantAt } from "./day-segments"

const at = (iso: string) => Temporal.Instant.from(iso)
const date = (iso: string) => Temporal.PlainDate.from(iso)
const TZ = "Europe/Stockholm"

describe("daySegments", () => {
  it("clips spans to the day and splits at midnight", () => {
    const spans = [
      { start: at("2026-11-02T08:00:00Z"), end: at("2026-11-02T09:30:00Z") },
      { start: at("2026-11-02T22:00:00Z"), end: at("2026-11-03T01:00:00Z") },
    ]
    expect(daySegments(spans, date("2026-11-02"), TZ)).toEqual([
      { startMinutes: 9 * 60, endMinutes: 10 * 60 + 30 },
      { startMinutes: 23 * 60, endMinutes: 24 * 60 },
    ])
    expect(daySegments(spans, date("2026-11-03"), TZ)).toEqual([
      { startMinutes: 0, endMinutes: 2 * 60 },
    ])
  })

  it("keeps wall-clock hours across DST", () => {
    // 09:00–17:00 Stockholm on the Monday after DST starts (UTC+2).
    const spans = [{ start: at("2026-03-30T07:00:00Z"), end: at("2026-03-30T15:00:00Z") }]
    expect(daySegments(spans, date("2026-03-30"), TZ)).toEqual([
      { startMinutes: 9 * 60, endMinutes: 17 * 60 },
    ])
  })

  it("runs a span ending at midnight to the bottom of the grid", () => {
    const spans = [{ start: at("2026-11-02T22:00:00Z"), end: at("2026-11-02T23:00:00Z") }]
    expect(daySegments(spans, date("2026-11-02"), TZ)).toEqual([
      { startMinutes: 23 * 60, endMinutes: 24 * 60 },
    ])
  })
})

describe("instantAt", () => {
  it("treats 1440 as the next midnight", () => {
    expect(instantAt(date("2026-11-02"), 1440, TZ).equals(at("2026-11-02T23:00:00Z"))).toBe(true)
    expect(instantAt(date("2026-11-02"), 9 * 60 + 15, TZ).equals(at("2026-11-02T08:15:00Z"))).toBe(
      true,
    )
  })
})
