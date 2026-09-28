import { z } from "zod"

import type { Appearance } from "@/themes/manifest"

// theme-bootstrap.js restores the theme before the CSS bundle loads. It can't
// resolve a family's variants, so useTheme caches the theme to show for each
// OS appearance, plus each theme's resolved background: with the appearance
// set to System, the OS can switch variants while renCal is closed.
const VARIANTS_CACHE_KEY = "themeVariants"
const BACKGROUND_CACHE_KEY = "themeBackgrounds"

const backgroundCacheSchema = z.record(z.string(), z.string())

export function cacheThemeVariants(variants: Record<Appearance, string>) {
  try {
    localStorage.setItem(VARIANTS_CACHE_KEY, JSON.stringify(variants))
  } catch {}
}

export function cacheThemeBackground(themeId: string, background: string) {
  try {
    const parsed = backgroundCacheSchema.safeParse(
      JSON.parse(localStorage.getItem(BACKGROUND_CACHE_KEY) ?? "{}"),
    )
    const cache = parsed.success ? parsed.data : {}
    if (cache[themeId] === background) return
    localStorage.setItem(BACKGROUND_CACHE_KEY, JSON.stringify({ ...cache, [themeId]: background }))
  } catch {}
}
