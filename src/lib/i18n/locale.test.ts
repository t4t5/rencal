import { describe, expect, it } from "vitest"

import { Locale } from "./locale"

describe("Locale", () => {
  it("reads a POSIX locale as the system reports it", () => {
    const locale = Locale.parse("de_DE.UTF-8")
    expect(locale?.language).toBe("de")
    expect(locale?.tag).toBe("de-DE")
  })

  it("reads a BCP 47 tag as the WebView reports it", () => {
    expect(Locale.parse("en-GB")?.tag).toBe("en-GB")
  })

  it("normalises case so equal locales compare equal", () => {
    expect(Locale.parse("DE-at")?.tag).toBe("de-AT")
  })

  it("accepts a bare language", () => {
    const locale = Locale.parse("fr")
    expect(locale?.language).toBe("fr")
    expect(locale?.tag).toBe("fr")
  })

  it("drops a POSIX modifier", () => {
    expect(Locale.parse("ca_ES@valencia")?.tag).toBe("ca-ES")
  })

  it.each(["", "C", "POSIX", "C.UTF-8", "123", "x"])("is not a locale: %j", (raw) => {
    expect(Locale.parse(raw)).toBeNull()
  })
})
