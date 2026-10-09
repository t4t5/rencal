import { describe, expect, it } from "vitest"

import { parseEventText, remindersAfterParse, segmentEventText } from "@/lib/magic-parser"
import { GERMAN } from "@/lib/magic-parser/vocabularies/de"
import { ENGLISH } from "@/lib/magic-parser/vocabularies/en"

// Monday 20 April 2026, 10:00.
const REF = new Date(2026, 3, 20, 10, 0)
const DE_FIRST = [GERMAN, ENGLISH]
const EN_ONLY = [ENGLISH]

describe("reminders in quick-add text", () => {
  it.each([
    [DE_FIRST, "Zahnarzt morgen 9 Uhr mit Erinnerung 1 Stunde vorher", "Zahnarzt", [60]],
    [DE_FIRST, "Zahnarzt morgen 9 Uhr mit Erinnerung 10 min", "Zahnarzt", [10]],
    [DE_FIRST, "Kino Freitag 20 Uhr Erinnerung 30 Minuten vorher", "Kino", [30]],
    [DE_FIRST, "Flug Samstag 6 Uhr mit Erinnerung einen Tag vorher", "Flug", [1440]],
    [DE_FIRST, "Abgabe Freitag mit Erinnerung 1 Woche und 2 Tage vorher", "Abgabe", [10080, 2880]],
    [DE_FIRST, "Arzt morgen 9 Uhr erinnere mich 2 Std. vorher", "Arzt", [120]],
    [EN_ONLY, "Dentist tomorrow 9am with reminder 1 hour before", "Dentist", [60]],
    [EN_ONLY, "Dentist tomorrow 9am remind me 10 min before", "Dentist", [10]],
    [EN_ONLY, "Flight saturday 6am with a reminder a day before", "Flight", [1440]],
    [
      EN_ONLY,
      "Deadline friday reminders 1 week, 2 days and 3 hours before",
      "Deadline",
      [10080, 2880, 180],
    ],
  ])("%#", (vocabularies, text, summary, reminders) => {
    const r = parseEventText(text, REF, vocabularies)
    expect({ summary: r.summary, reminders: r.reminders }).toEqual({ summary, reminders })
  })

  it("does not read the reminder offset as the event time", () => {
    const r = parseEventText("Zahnarzt morgen 9 Uhr mit Erinnerung 1 Stunde vorher", REF, DE_FIRST)
    expect(r.start?.value.toString()).toBe("2026-04-21T09:00:00+02:00[Europe/Berlin]")
  })

  it("has no reminders when the text names none", () => {
    expect(parseEventText("Zahnarzt morgen 9 Uhr", REF, DE_FIRST).reminders).toBeNull()
  })

  it("marks the reminder phrase", () => {
    const segments = segmentEventText("Zahnarzt mit Erinnerung 10 min", REF, DE_FIRST)
    expect(segments.filter((s) => s.parsed).map((s) => s.text)).toEqual(["mit Erinnerung 10 min"])
  })
})

describe("remindersAfterParse", () => {
  const DEFAULTS = [15]

  it("takes reminders written in the text", () => {
    expect(remindersAfterParse([60], DEFAULTS, false)).toEqual({ reminders: [60], fromText: true })
  })

  it("restores the defaults when the text no longer names reminders", () => {
    expect(remindersAfterParse(null, DEFAULTS, true)).toEqual({
      reminders: DEFAULTS,
      fromText: false,
    })
  })

  it("leaves reminders the user picked by hand alone", () => {
    expect(remindersAfterParse(null, DEFAULTS, false)).toEqual({ reminders: null, fromText: false })
  })
})
