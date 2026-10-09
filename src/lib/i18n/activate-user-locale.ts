import type { Messages } from "@lingui/core"

import { Locale } from "./locale"
import { negotiateLocale } from "./negotiate-locale"
import type { CatalogLoader, LocaleActivator, PreferredLocalesSource } from "./ports"

interface ActivateUserLocaleDeps {
  preferredLocales: PreferredLocalesSource
  catalogs: CatalogLoader
  activator: LocaleActivator
  catalogLanguages: readonly string[]
  fallback: Locale
}

/**
 * Use case: pick the user's locale and make it active before the first render.
 * A catalog that fails to load never leaves the UI without a locale: the
 * fallback is activated instead, with no messages if even its catalog fails
 * (Lingui then shows the English source text).
 */
export async function activateUserLocale({
  preferredLocales,
  catalogs,
  activator,
  catalogLanguages,
  fallback,
}: ActivateUserLocaleDeps): Promise<Locale> {
  const preferences = preferredLocales
    .preferredLocales()
    .map((raw) => Locale.parse(raw))
    .filter((locale): locale is Locale => locale !== null)
  const chosen = negotiateLocale(preferences, catalogLanguages, fallback)

  const messages = await tryLoad(catalogs, chosen.language)
  if (messages) {
    activator.activate(chosen, messages)
    return chosen
  }

  activator.activate(fallback, (await tryLoad(catalogs, fallback.language)) ?? {})
  return fallback
}

async function tryLoad(catalogs: CatalogLoader, language: string): Promise<Messages | null> {
  try {
    return await catalogs.load(language)
  } catch (e) {
    console.error(`Could not load the "${language}" message catalog`, e)
    return null
  }
}
