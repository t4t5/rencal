import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it } from "vitest"

import { parseEventText, segmentEventText } from "@/lib/magic-parser"
import { GERMAN } from "@/lib/magic-parser/vocabularies/de"
import { ENGLISH } from "@/lib/magic-parser/vocabularies/en"

// Monday 20 April 2026, 10:00.
const DE_FIRST = [GERMAN, ENGLISH]
const EN_ONLY = [ENGLISH]
const REF = new Date(2026, 3, 20, 10, 0)
const at = (iso: string) => `${iso}+02:00[Europe/Berlin]`

describe("a day and a time separated by other words", () => {
  it.each([
    [DE_FIRST, "Heute essen im Nanami um 19 Uhr", "essen", at("2026-04-20T19:00:00"), "Nanami"],
    [DE_FIRST, "Freitag Zahnarzt um 9:30", "Zahnarzt", at("2026-04-24T09:30:00"), null],
    [DE_FIRST, "Morgen Kino im Metropol 20 Uhr", "Kino", at("2026-04-21T20:00:00"), "Metropol"],
    [EN_ONLY, "Dinner tomorrow at Nanami at 7pm", "Dinner", at("2026-04-21T19:00:00"), "Nanami"],
  ])("%#", (vocabularies, text, summary, start, location) => {
    const r = parseEventText(text, REF, vocabularies)
    expect({ summary: r.summary, start: r.start?.value.toString(), location: r.location }).toEqual({
      summary,
      start,
      location,
    })
    expect(r.end?.value.toString()).toBe(
      Temporal.ZonedDateTime.from(start).add({ hours: 1 }).toString(),
    )
  })

  it("marks both the day and the time", () => {
    const segments = segmentEventText("Heute essen im Nanami um 19 Uhr", REF, DE_FIRST)
    expect(segments.filter((s) => s.parsed).map((s) => s.text)).toEqual([
      "Heute",
      "Nanami",
      "um 19 Uhr",
    ])
  })
})
