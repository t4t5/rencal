/*
 * Localization context. Domain: Locale and negotiateLocale. Use case:
 * activateUserLocale. Adapters plug config.toml, the WebView, the compiled .po catalogs,
 * Lingui, the date formatters and the quick-add parser into the ports. This module is the
 * composition root the app entry calls once before the first render.
 */
import { i18n } from "@lingui/core"

import { setDisplayLocale } from "@/lib/event-time"
import { setParserLanguage } from "@/lib/magic-parser"

import { activateUserLocale } from "./activate-user-locale"
import { ConfigTomlLanguage } from "./adapters/config-toml-language"
import { LinguiActivator } from "./adapters/lingui-activator"
import { NavigatorPreferredLocales } from "./adapters/navigator-preferred-locales"
import { PoCatalogLoader } from "./adapters/po-catalog-loader"
import { CATALOG_LANGUAGES } from "./catalog-languages"
import { Locale } from "./locale"

const FALLBACK_LOCALE = Locale.parse("en-GB") as Locale

export function activateSystemLocale(): Promise<Locale> {
  return activateUserLocale({
    configuredLanguage: new ConfigTomlLanguage(),
    preferredLocales: new NavigatorPreferredLocales(navigator),
    catalogs: new PoCatalogLoader(),
    activator: new LinguiActivator(
      i18n,
      [(locale) => setDisplayLocale(locale.tag), (locale) => setParserLanguage(locale.language)],
      document.documentElement,
    ),
    catalogLanguages: CATALOG_LANGUAGES,
    fallback: FALLBACK_LOCALE,
  })
}
