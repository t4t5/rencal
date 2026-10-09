import { describe, expect, it } from "vitest"

import { parseEventText, segmentEventText } from "@/lib/magic-parser"
import { GERMAN } from "@/lib/magic-parser/vocabularies/de"
import { ENGLISH } from "@/lib/magic-parser/vocabularies/en"

// Monday 20 April 2026, 10:00; German UI, so German first and English as fallback.
const REF = new Date(2026, 3, 20, 10, 0)
const DE_FIRST = [GERMAN, ENGLISH]

const summarize = (text: string) => {
  const r = parseEventText(text, REF, DE_FIRST)
  return {
    summary: r.summary,
    start: r.start ? `${r.start.kind}:${r.start.value.toString()}` : null,
    rrule: r.recurrence?.rrule ?? null,
    location: r.location,
  }
}

const at = (iso: string) => `datetime_zoned:${iso}+02:00[Europe/Berlin]`

describe("parseEventText in German", () => {
  it.each([
    ["Mittagessen morgen um 13 Uhr", "Mittagessen", at("2026-04-21T13:00:00"), null, null],
    [
      "Standup jeden Montag um 9 Uhr",
      "Standup",
      at("2026-04-27T09:00:00"),
      "FREQ=WEEKLY;BYDAY=MO",
      null,
    ],
    ["Yoga montags 18 Uhr", "Yoga", at("2026-04-20T18:00:00"), "FREQ=WEEKLY;BYDAY=MO", null],
    [
      "Abendessen Freitag 19 Uhr in Berlin",
      "Abendessen",
      at("2026-04-24T19:00:00"),
      null,
      "Berlin",
    ],
    ["Review am 3. Juni", "Review", "date:2026-06-03", null, null],
    ["Kaffee mit Anna im Café Central", "Kaffee mit Anna", null, null, "Café Central"],
    ["Sport täglich", "Sport", null, "FREQ=DAILY", null],
    ["Sport jeden Tag", "Sport", null, "FREQ=DAILY", null],
    ["Putzen jede Woche", "Putzen", null, "FREQ=WEEKLY", null],
    ["Putzen wöchentlich", "Putzen", null, "FREQ=WEEKLY", null],
    ["Miete jeden Monat", "Miete", null, "FREQ=MONTHLY", null],
    ["Miete monatlich", "Miete", null, "FREQ=MONTHLY", null],
    ["Steuer jedes Jahr", "Steuer", null, "FREQ=YEARLY", null],
    ["Steuer jährlich", "Steuer", null, "FREQ=YEARLY", null],
    ["Teamrunde werktags", "Teamrunde", null, "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", null],
    ["Teamrunde jeden Werktag", "Teamrunde", null, "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", null],
    ["Ausflug jedes Wochenende", "Ausflug", null, "FREQ=WEEKLY;BYDAY=SA,SU", null],
  ])("%s", (text, summary, start, rrule, location) => {
    expect(summarize(text)).toEqual({ summary, start, rrule, location })
  })

  it("parses a date range without leaving the connector in the title", () => {
    const r = parseEventText("Urlaub vom 15. Juni bis 18. Juni", REF, DE_FIRST)
    expect(r.summary).toBe("Urlaub")
    expect(r.start?.value.toString()).toBe("2026-06-15")
    expect(r.end?.value.toString()).toBe("2026-06-19")
  })

  it("still understands English when German comes first", () => {
    expect(summarize("Lunch tomorrow at 1pm")).toEqual({
      summary: "Lunch",
      start: at("2026-04-21T13:00:00"),
      rrule: null,
      location: null,
    })
  })

  it("marks German recurrence and location", () => {
    const segments = segmentEventText("Standup jeden Montag im Raum 4", REF, DE_FIRST)
    expect(segments.filter((s) => s.parsed).map((s) => s.text)).toEqual(["jeden Montag", "Raum 4"])
  })
})
