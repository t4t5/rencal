import { describe, expect, it } from "@/lib/testing/vitest"
import { timeKey, timeOptions } from "@/lib/time-options"

const keys = (...args: Parameters<typeof timeOptions>) => timeOptions(...args).map(timeKey)

describe("timeOptions", () => {
  it("lists every quarter hour", () => {
    const all = keys("", "24h")
    expect(all.length).toBe(96)
    expect(all.slice(0, 2)).toEqual(["00:00", "00:15"])
  })

  it("slots an off-grid current time in order", () => {
    const all = keys("", "24h", { hour: 9, minute: 7 })
    expect(all.slice(36, 39)).toEqual(["09:00", "09:07", "09:15"])
    expect(keys("", "24h", { hour: 23, minute: 50 }).at(-1)).toBe("23:50")
  })

  it("reads typed times", () => {
    expect(keys("15:30", "24h")).toEqual(["15:30"])
    expect(keys("3pm", "24h")).toEqual(["15:00", "15:15", "15:30", "15:45"])
    expect(keys("12:05am", "12h")).toEqual(["00:05"])
    expect(keys("9", "24h")).toEqual(["09:00", "09:15", "09:30", "09:45"])
  })

  it("offers AM and PM for a bare hour in 12h", () => {
    expect(keys("3:30", "12h")).toEqual(["03:30", "15:30"])
  })

  it("rejects what it can't read", () => {
    expect(keys("soon", "24h")).toEqual([])
    expect(keys("25", "24h")).toEqual([])
    expect(keys("9:75", "24h")).toEqual([])
  })
})
