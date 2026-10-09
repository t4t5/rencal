import { setupI18n } from "@lingui/core"
import { expect, it, vi } from "vitest"

import { Locale } from "@/lib/i18n/locale"

import { LinguiActivator } from "./lingui-activator"

it("activates the catalog language and hands the full tag to formatting", () => {
  const i18n = setupI18n()
  const setDisplayLocaleSpy = vi.fn<(tag: string) => void>()
  // Fake document root: a plain object standing in for <html>.
  const htmlFake = { lang: "" }

  new LinguiActivator(i18n, setDisplayLocaleSpy, htmlFake).activate(
    Locale.parse("de-AT") as Locale,
    { Today: "Heute" },
  )

  expect(i18n.locale).toBe("de")
  expect(i18n._("Today")).toBe("Heute")
  expect(setDisplayLocaleSpy).toHaveBeenCalledExactlyOnceWith("de-AT")
  expect(htmlFake.lang).toBe("de-AT")
})
