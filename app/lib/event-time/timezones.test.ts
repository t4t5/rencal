import { describe, expect, it } from "@/lib/testing/vitest"

import { normalizeExtraTimeZones } from "./timezones"

describe("normalizeExtraTimeZones", () => {
  it("keeps known zones in order", () => {
    expect(normalizeExtraTimeZones(["Europe/London", "America/Los_Angeles"])).toEqual([
      "Europe/London",
      "America/Los_Angeles",
    ])
  })

  it("drops unknown zones, repeats and anything past the limit", () => {
    expect(
      normalizeExtraTimeZones([
        "Mars/Olympus_Mons",
        "Europe/London",
        "Europe/London",
        "Asia/Tokyo",
        "America/Los_Angeles",
      ]),
    ).toEqual(["Europe/London", "Asia/Tokyo"])
  })
})
