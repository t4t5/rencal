import type { Messages } from "@lingui/core"
import { describe, expect, it, vi } from "vitest"

import { activateUserLocale } from "./activate-user-locale"
import { Locale } from "./locale"
import type {
  CatalogLoader,
  ConfiguredLanguageSource,
  LocaleActivator,
  PreferredLocalesSource,
} from "./ports"

const CATALOG_LANGUAGES = ["en", "de"] as const
const FALLBACK = Locale.parse("en-GB") as Locale
const GERMAN_MESSAGES: Messages = { greeting: "Hallo" }
const ENGLISH_MESSAGES: Messages = { greeting: "Hello" }

// Stub (Meszaros): feeds indirect input, verifies nothing.
const preferredLocalesStub = (...raw: string[]): PreferredLocalesSource => ({
  preferredLocales: () => raw,
})

// Stubs for the config.toml override.
const noConfiguredLanguage: ConfiguredLanguageSource = { configuredLanguage: async () => null }
const configuredLanguageStub = (language: string): ConfiguredLanguageSource => ({
  configuredLanguage: async () => language,
})
const unreadableConfigStub: ConfiguredLanguageSource = {
  configuredLanguage: async () => {
    throw new Error("config.toml is not valid TOML")
  },
}

// Mock: the loader's expected calls are part of the assertion.
const catalogLoaderMock = (catalogs: Record<string, Messages>) => ({
  load: vi.fn<CatalogLoader["load"]>(async (language) => {
    const messages = catalogs[language]
    if (!messages) throw new Error(`no catalog for ${language}`)
    return messages
  }),
})

// Spy: records indirect output for the test to inspect afterwards.
const activatorSpy = () => ({ activate: vi.fn<LocaleActivator["activate"]>() })

describe("activateUserLocale", () => {
  it("activates the preferred locale with its catalog", async () => {
    const catalogs = catalogLoaderMock({ de: GERMAN_MESSAGES })
    const activator = activatorSpy()

    const locale = await activateUserLocale({
      configuredLanguage: noConfiguredLanguage,
      preferredLocales: preferredLocalesStub("de-DE"),
      catalogs,
      activator,
      catalogLanguages: CATALOG_LANGUAGES,
      fallback: FALLBACK,
    })

    expect(locale.tag).toBe("de-DE")
    expect(catalogs.load).toHaveBeenCalledExactlyOnceWith("de")
    expect(activator.activate).toHaveBeenCalledExactlyOnceWith(locale, GERMAN_MESSAGES)
  })

  it("ignores platform entries that are not locales", async () => {
    const activator = activatorSpy()

    const locale = await activateUserLocale({
      configuredLanguage: noConfiguredLanguage,
      preferredLocales: preferredLocalesStub("C", "de_AT.UTF-8"),
      catalogs: catalogLoaderMock({ de: GERMAN_MESSAGES }),
      activator,
      catalogLanguages: CATALOG_LANGUAGES,
      fallback: FALLBACK,
    })

    expect(locale.tag).toBe("de-AT")
  })

  it("falls back to the fallback catalog when the preferred one fails to load", async () => {
    const catalogs = catalogLoaderMock({ en: ENGLISH_MESSAGES })
    const activator = activatorSpy()

    const locale = await activateUserLocale({
      configuredLanguage: noConfiguredLanguage,
      preferredLocales: preferredLocalesStub("de-DE"),
      catalogs,
      activator,
      catalogLanguages: CATALOG_LANGUAGES,
      fallback: FALLBACK,
    })

    expect(locale).toBe(FALLBACK)
    expect(catalogs.load.mock.calls).toEqual([["de"], ["en"]])
    expect(activator.activate).toHaveBeenCalledExactlyOnceWith(FALLBACK, ENGLISH_MESSAGES)
  })

  it("still activates the fallback without messages when no catalog loads", async () => {
    const activator = activatorSpy()

    await activateUserLocale({
      configuredLanguage: noConfiguredLanguage,
      preferredLocales: preferredLocalesStub("de-DE"),
      catalogs: catalogLoaderMock({}),
      activator,
      catalogLanguages: CATALOG_LANGUAGES,
      fallback: FALLBACK,
    })

    expect(activator.activate).toHaveBeenCalledExactlyOnceWith(FALLBACK, {})
  })

  it("lets the configured language override the system locale", async () => {
    const locale = await activateUserLocale({
      configuredLanguage: configuredLanguageStub("en"),
      preferredLocales: preferredLocalesStub("de-DE"),
      catalogs: catalogLoaderMock({ en: ENGLISH_MESSAGES, de: GERMAN_MESSAGES }),
      activator: activatorSpy(),
      catalogLanguages: CATALOG_LANGUAGES,
      fallback: FALLBACK,
    })

    expect(locale.language).toBe("en")
  })

  it("uses the system locale when the configured language has no catalog", async () => {
    const locale = await activateUserLocale({
      configuredLanguage: configuredLanguageStub("tlh"),
      preferredLocales: preferredLocalesStub("de-DE"),
      catalogs: catalogLoaderMock({ de: GERMAN_MESSAGES }),
      activator: activatorSpy(),
      catalogLanguages: CATALOG_LANGUAGES,
      fallback: FALLBACK,
    })

    expect(locale.tag).toBe("de-DE")
  })

  it("uses the system locale when the config cannot be read", async () => {
    const locale = await activateUserLocale({
      configuredLanguage: unreadableConfigStub,
      preferredLocales: preferredLocalesStub("de-DE"),
      catalogs: catalogLoaderMock({ de: GERMAN_MESSAGES }),
      activator: activatorSpy(),
      catalogLanguages: CATALOG_LANGUAGES,
      fallback: FALLBACK,
    })

    expect(locale.tag).toBe("de-DE")
  })
})
