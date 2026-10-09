import { setupI18n } from "@lingui/core"
import { expect, it, vi } from "vitest"

import { Locale } from "@/lib/i18n/locale"

import { LinguiActivator } from "./lingui-activator"

it("activates the catalog language and tells every follower the locale", () => {
  const i18n = setupI18n()
  const displayFollowerSpy = vi.fn<(locale: Locale) => void>()
  const parserFollowerSpy = vi.fn<(locale: Locale) => void>()
  // Fake document root: a plain object standing in for <html>.
  const htmlFake = { lang: "" }

  const austrian = Locale.parse("de-AT") as Locale

  new LinguiActivator(i18n, [displayFollowerSpy, parserFollowerSpy], htmlFake).activate(austrian, {
    Today: "Heute",
  })

  expect(i18n.locale).toBe("de")
  expect(i18n._("Today")).toBe("Heute")
  expect(displayFollowerSpy).toHaveBeenCalledExactlyOnceWith(austrian)
  expect(parserFollowerSpy).toHaveBeenCalledExactlyOnceWith(austrian)
  expect(htmlFake.lang).toBe("de-AT")
})
