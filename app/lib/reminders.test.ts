import { humanDuration, reminderQueryValues } from "@/lib/reminders"
import { describe, expect, it } from "@/lib/testing/vitest"

describe("reminderQueryValues", () => {
  it("reads a unit", () => {
    expect(reminderQueryValues("2h")).toEqual([120])
    expect(reminderQueryValues("3 days")).toEqual([3 * 24 * 60])
  })

  it("offers every unit for a bare number", () => {
    expect(reminderQueryValues("1").slice(0, 3)).toEqual([1, 60, 1440])
  })

  it("rejects what it can't read", () => {
    expect(reminderQueryValues("soon")).toEqual([])
    expect(reminderQueryValues("0")).toEqual([])
    expect(reminderQueryValues("2 parsecs")).toEqual([])
  })
})

describe("humanDuration", () => {
  it("names the event's own time", () => {
    expect(humanDuration(0)).toBe("At time of event")
  })

  it("spells out each unit", () => {
    expect(humanDuration(90)).toBe("1 hour, 30 minutes")
    expect(humanDuration(1440)).toBe("1 day")
  })

  it("reads negatives as a time on the day", () => {
    expect(humanDuration(-480)).toBe("On day of event (08:00)")
  })
})
