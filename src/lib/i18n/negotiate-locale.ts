import type { Locale } from "./locale"

/**
 * Picks the first preferred locale whose language has a catalog. The region is
 * kept so formatting follows it (de-AT, de-CH); without any match the fallback wins.
 */
export function negotiateLocale(
  preferences: readonly Locale[],
  catalogLanguages: readonly string[],
  fallback: Locale,
): Locale {
  return preferences.find((locale) => catalogLanguages.includes(locale.language)) ?? fallback
}
