import { describe, expect, it } from "vitest"

import { parseEventText, segmentEventText } from "@/lib/magic-parser"

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

// Characterization of the English parser before vocabularies were introduced.
// Reference: Monday 20 April 2026, 10:00 (tests run in Europe/Berlin).
const REF = new Date(2026, 3, 20, 10, 0)

const summarize = (text: string) => {
  const r = parseEventText(text, REF)
  return {
    summary: r.summary,
    start: r.start ? `${r.start.kind}:${r.start.value.toString()}` : null,
    rrule: r.recurrence?.rrule ?? null,
    location: r.location,
  }
}

describe("parseEventText in English", () => {
  it.each([
    [
      "Lunch tomorrow at 1pm",
      "Lunch",
      "datetime_zoned:2026-04-21T13:00:00+02:00[Europe/Berlin]",
      null,
      null,
    ],
    [
      "Standup every monday at 9am",
      "Standup",
      "datetime_zoned:2026-04-27T09:00:00+02:00[Europe/Berlin]",
      "FREQ=WEEKLY;BYDAY=MO",
      null,
    ],
    ["Gym every day", "Gym", null, "FREQ=DAILY", null],
    ["Coffee with Anna at Café Central", "Coffee with Anna", null, null, "Café Central"],
    [
      "Dinner friday 7pm in Berlin",
      "Dinner",
      "datetime_zoned:2026-04-24T19:00:00+02:00[Europe/Berlin]",
      null,
      "Berlin",
    ],
    ["Team offsite every weekday", "Team offsite", null, "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", null],
    ["Review on june 3", "Review", "date:2026-06-03", null, null],
  ])("%s", (text, summary, start, rrule, location) => {
    expect(summarize(text)).toEqual({ summary, start, rrule, location })
  })

  it("defaults a timed event to the default duration", () => {
    const r = parseEventText("Lunch tomorrow at 1pm", REF)
    expect(r.end?.value.toString()).toBe("2026-04-21T14:00:00+02:00[Europe/Berlin]")
  })
})

describe("segmentEventText in English", () => {
  it("marks recurrence and location", () => {
    // The time after a recurring weekday is not marked: the parser searches for
    // the chrono match ("monday at 9am") in the original text, where it doesn't occur.
    expect(segmentEventText("Standup every monday at 9am in Room 4", REF)).toEqual([
      { text: "Standup ", parsed: false },
      { text: "every monday", parsed: true },
      { text: " at 9am in ", parsed: false },
      { text: "Room 4", parsed: true },
    ])
  })
})
