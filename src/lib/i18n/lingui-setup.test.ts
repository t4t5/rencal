import { i18n } from "@lingui/core"
import { msg, t } from "@lingui/core/macro"
import { afterEach, expect, it } from "vitest"

afterEach(() => i18n.activate("en"))

it("translates a macro message with the active catalog", () => {
  const name = "Ada"
  expect(t`Hello ${name}`).toBe("Hello Ada")
  i18n.load("de", { [msg`Hello ${name}`.id]: "Hallo {name}" })
  i18n.activate("de")
  expect(t`Hello ${name}`).toBe("Hallo Ada")
})
