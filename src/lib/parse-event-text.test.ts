import { describe, expect, it } from "vitest"

import { toInteropDate } from "@/lib/event-time"
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
    expect(result.start?.kind).toBe("date")
    const startDate = result.start && toInteropDate(result.start)
    expect(startDate?.getFullYear()).toBe(2026)
    expect(startDate?.getMonth()).toBe(5) // June
    expect(startDate?.getDate()).toBe(15)

    // End is exclusive (iCal convention): June 18 inclusive → June 19 00:00
    expect(result.end).not.toBeNull()
    expect(result.end?.kind).toBe("date")
    const endDate = result.end && toInteropDate(result.end)
    expect(endDate?.getFullYear()).toBe(2026)
    expect(endDate?.getMonth()).toBe(5) // June
    expect(endDate?.getDate()).toBe(19)
  })
})
