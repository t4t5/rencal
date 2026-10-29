import { describe, expect, it } from "vitest"

import { durationQueryValues, formatDuration, MINUTE_UNITS } from "@/lib/duration-query"

describe("durationQueryValues", () => {
  it("offers every unit for a bare number", () => {
    expect(durationQueryValues("2", MINUTE_UNITS)).toEqual([2, 120, 2880, 20160, 80640])
  })

  it("reads a unit, with or without a space", () => {
    expect(durationQueryValues("36h", MINUTE_UNITS)).toEqual([2160])
    expect(durationQueryValues("3 days", MINUTE_UNITS)).toEqual([4320])
  })

  it("rejects zero and unknown units", () => {
    expect(durationQueryValues("0", MINUTE_UNITS)).toEqual([])
    expect(durationQueryValues("2 fortnights", MINUTE_UNITS)).toEqual([])
  })
})

describe("formatDuration", () => {
  it("lists units largest first", () => {
    expect(formatDuration(60, MINUTE_UNITS)).toBe("1 hour")
    expect(formatDuration(1680, MINUTE_UNITS)).toBe("1 day, 4 hours")
    expect(formatDuration(90, MINUTE_UNITS)).toBe("1 hour, 30 minutes")
  })
})
