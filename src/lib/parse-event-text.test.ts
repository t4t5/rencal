import { describe, expect, it } from "vitest"

import { parseEventText } from "@/lib/parse-event-text"

describe("parseEventText", () => {
  it("parses a multi-day range: 'Holiday from june 15 to june 18'", () => {
    const referenceDate = new Date(2026, 3, 20) // 2026-04-20
    const result = parseEventText("Holiday from june 15 to june 18", referenceDate)

    expect(result.summary).toBe("Holiday")
    expect(result.allDay).toBe(true)
    expect(result.recurrence).toBeNull()
    expect(result.location).toBeNull()
    expect(result.chronoMatchText).toBe("june 15 to june 18")

    expect(result.start).not.toBeNull()
    expect(result.start?.getFullYear()).toBe(2026)
    expect(result.start?.getMonth()).toBe(5) // June
    expect(result.start?.getDate()).toBe(15)
    expect(result.start?.getHours()).toBe(0)
    expect(result.start?.getMinutes()).toBe(0)

    // End is exclusive (iCal convention): June 18 inclusive → June 19 00:00
    expect(result.end).not.toBeNull()
    expect(result.end?.getFullYear()).toBe(2026)
    expect(result.end?.getMonth()).toBe(5) // June
    expect(result.end?.getDate()).toBe(19)
    expect(result.end?.getHours()).toBe(0)
    expect(result.end?.getMinutes()).toBe(0)
  })
})
