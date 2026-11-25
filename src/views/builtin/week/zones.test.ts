import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it, vi } from "vitest"

import { formatZoneHour, hourInZone, zoneAbbreviation, zoneDescription } from "./zones"

// The real SDK pulls in the Tauri RPC proxy, which needs a window.
vi.mock("@/sdk", async () => ({
  formatWallclockTime: (await import("@/lib/event-time/display")).formatWallclockTime,
}))

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

describe("formatZoneHour", () => {
  const label = (hour: number, minute: number, format: "12h" | "24h") =>
    formatZoneHour({ hour, minute }, format)

  it("leaves 24-hour labels as they were", () => {
    expect(label(0, 0, "24h")).toBe("00:00")
    expect(label(9, 0, "24h")).toBe("09:00")
    expect(label(12, 0, "24h")).toBe("12:00")
    expect(label(19, 30, "24h")).toBe("19:30")
  })

  it("drops the minutes from 12-hour labels on the hour", () => {
    expect(label(9, 0, "12h")).toBe("9 AM")
    expect(label(10, 0, "12h")).toBe("10 AM")
    expect(label(13, 0, "12h")).toBe("1 PM")
    expect(label(23, 0, "12h")).toBe("11 PM")
  })

  it("names noon and shows midnight as 12 AM", () => {
    expect(label(12, 0, "12h")).toBe("noon")
    expect(label(0, 0, "12h")).toBe("12 AM")
  })

  it("keeps the minutes of zones off the hour, with a one-letter period", () => {
    expect(label(9, 30, "12h")).toBe("9:30a")
    expect(label(19, 30, "12h")).toBe("7:30p")
    expect(label(12, 30, "12h")).toBe("12:30p")
    expect(label(0, 45, "12h")).toBe("12:45a")
  })
})
