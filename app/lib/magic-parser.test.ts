import { parseEventText } from "@/lib/magic-parser"
import { describe, expect, it } from "@/lib/testing/vitest"

describe("parseEventText", () => {
  it("parses a multi-day range: 'Holiday from june 15 to june 18'", () => {
    const referenceDate = new Date(2026, 3, 20) // 2026-04-20
    const result = parseEventText("Holiday from june 15 to june 18", referenceDate)

    expect(result.summary).toBe("Holiday")
    expect(result.recurrence).toBeNull()
    expect(result.location).toBeNull()
    expect(result.chronoMatchText).toBe("june 15 to june 18")

    expect(result.start).not.toBeNull()
    expect(result.start?.kind).toBe("date")
    expect(result.start?.value.toString()).toBe("2026-06-15")

    // End is exclusive (iCal convention): June 18 inclusive → June 19
    expect(result.end).not.toBeNull()
    expect(result.end?.kind).toBe("date")
    expect(result.end?.value.toString()).toBe("2026-06-19")
  })
})
