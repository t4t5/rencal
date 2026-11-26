import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it } from "vitest"

import { hourInZone, zoneAbbreviation, zoneColumnWidth, zoneDescription } from "./zones"

const winter = Temporal.PlainDate.from("2026-11-14")
const summer = Temporal.PlainDate.from("2026-07-14")

describe("hourInZone", () => {
  const at = (hour: number, tzid: string, date = winter) =>
    hourInZone(date, hour, "America/New_York", tzid)

  it("reads the viewer's hours as they are", () => {
    expect(at(9, "America/New_York")).toEqual({ hour: 9, minute: 0 })
  })

  it("converts the viewer's hour to the other zone, across midnight", () => {
    expect(at(9, "America/Los_Angeles")).toEqual({ hour: 6, minute: 0 })
    expect(at(1, "America/Los_Angeles")).toEqual({ hour: 22, minute: 0 })
    expect(at(20, "Europe/London")).toEqual({ hour: 1, minute: 0 })
  })

  it("keeps the minutes of zones off the hour", () => {
    expect(at(9, "Asia/Kolkata")).toEqual({ hour: 19, minute: 30 })
  })

  it("uses the offsets of the day shown", () => {
    // Arizona has no daylight saving: two hours behind New York in winter, three in summer.
    expect(at(9, "America/Phoenix", winter)).toEqual({ hour: 7, minute: 0 })
    expect(at(9, "America/Phoenix", summer)).toEqual({ hour: 6, minute: 0 })
  })
})

describe("zone names", () => {
  it("abbreviates the zone as it is on the day", () => {
    expect(zoneAbbreviation("America/New_York", winter)).toBe("EST")
    expect(zoneAbbreviation("America/New_York", summer)).toBe("EDT")
  })

  it("abbreviates a zone without a name to its offset", () => {
    expect(zoneAbbreviation("Asia/Kolkata", winter)).toBe("+5:30")
    expect(zoneAbbreviation("Europe/Paris", winter)).toBe("+1")
    expect(zoneAbbreviation("Europe/London", winter)).toBe("GMT")
  })

  it("describes the zone by city and offset", () => {
    expect(zoneDescription("America/Los_Angeles", winter)).toBe("Los Angeles, GMT-8")
    expect(zoneDescription("America/Los_Angeles", summer)).toBe("Los Angeles, GMT-7")
    expect(zoneDescription("Asia/Kolkata", winter)).toBe("Kolkata, GMT+5:30")
  })
})

describe("zoneColumnWidth", () => {
  const width = (tzid: string, format: "12h" | "24h", viewer = "America/New_York") =>
    zoneColumnWidth(winter, viewer, tzid, format)

  it("keeps whole-hour zones narrow in both formats", () => {
    expect(width("Europe/London", "12h")).toBe(48)
    expect(width("Europe/London", "24h")).toBe(48)
  })

  it("widens 12-hour zones off the hour, measured against the viewer's", () => {
    expect(width("Asia/Kolkata", "12h")).toBe(64)
    expect(width("Asia/Kolkata", "24h")).toBe(48)
    expect(width("Asia/Kolkata", "12h", "Asia/Kolkata")).toBe(48)
    expect(width("Europe/London", "12h", "Asia/Kolkata")).toBe(64)
  })
})
