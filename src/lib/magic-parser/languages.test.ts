import { afterEach, describe, expect, it } from "vitest"

import { parseEventText, setParserLanguage, vocabulariesFor } from "@/lib/magic-parser"
import { GERMAN } from "@/lib/magic-parser/vocabularies/de"
import { ENGLISH } from "@/lib/magic-parser/vocabularies/en"

afterEach(() => setParserLanguage("en"))

describe("vocabulariesFor", () => {
  it("puts the UI language first and English after it", () => {
    expect(vocabulariesFor("de")).toEqual([GERMAN, ENGLISH])
  })

  it("uses English alone for English", () => {
    expect(vocabulariesFor("en")).toEqual([ENGLISH])
  })

  it("uses English for a language without a vocabulary", () => {
    expect(vocabulariesFor("tlh")).toEqual([ENGLISH])
  })
})

describe("setParserLanguage", () => {
  it("makes the default parse follow the active language", () => {
    expect(parseEventText("Sport täglich").recurrence).toBeNull()
    setParserLanguage("de")
    expect(parseEventText("Sport täglich").recurrence?.rrule).toBe("FREQ=DAILY")
  })
})
