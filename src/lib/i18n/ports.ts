/*
 * Ports of the localization context. Infrastructure (WebView, compiled
 * catalogs, Lingui, the date formatters) sits behind these; the use case and
 * its tests only see the interfaces.
 */
import type { Messages } from "@lingui/core"

import type { Locale } from "./locale"

/** Raw locale strings in order of preference, as the platform reports them. */
export interface PreferredLocalesSource {
  preferredLocales(): readonly string[]
}

/** The user's explicit language choice (config.toml `language`), if any. */
export interface ConfiguredLanguageSource {
  configuredLanguage(): Promise<string | null>
}

/** Loads the compiled messages for one catalog language. */
export interface CatalogLoader {
  load(language: string): Promise<Messages>
}

/** Makes a locale and its messages the active ones for the whole UI. */
export interface LocaleActivator {
  activate(locale: Locale, messages: Messages): void
}
