import { expect, it } from "vitest"

import { NavigatorPreferredLocales } from "./navigator-preferred-locales"

it("reports the WebView's language list in order", () => {
  // Stub for the browser's Navigator.
  const navigatorStub = { languages: ["de-DE", "en-US"], language: "de-DE" }
  expect(new NavigatorPreferredLocales(navigatorStub).preferredLocales()).toEqual([
    "de-DE",
    "en-US",
  ])
})

it("falls back to the single language when the list is empty", () => {
  const navigatorStub = { languages: [], language: "fr-FR" }
  expect(new NavigatorPreferredLocales(navigatorStub).preferredLocales()).toEqual(["fr-FR"])
})
