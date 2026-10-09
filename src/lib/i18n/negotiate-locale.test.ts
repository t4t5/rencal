import { describe, expect, it } from "vitest"

import { Locale } from "./locale"
import { negotiateLocale } from "./negotiate-locale"

const locales = (...tags: string[]) => tags.map((tag) => Locale.parse(tag) as Locale)
const FALLBACK = Locale.parse("en-GB") as Locale

describe("negotiateLocale", () => {
  it("keeps the region of the preferred locale for formatting", () => {
    expect(negotiateLocale(locales("de-AT"), ["en", "de"], FALLBACK).tag).toBe("de-AT")
  })

  it("skips preferences without a catalog and takes the next one", () => {
    expect(negotiateLocale(locales("tr-TR", "de-DE"), ["en", "de"], FALLBACK).tag).toBe("de-DE")
  })

  it("falls back when no preference has a catalog", () => {
    expect(negotiateLocale(locales("tr-TR"), ["en", "de"], FALLBACK)).toBe(FALLBACK)
  })

  it("falls back when there are no preferences", () => {
    expect(negotiateLocale([], ["en", "de"], FALLBACK)).toBe(FALLBACK)
  })
})
