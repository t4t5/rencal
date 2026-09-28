import { z } from "zod"

import type { Appearance } from "@/themes/manifest"

// theme-bootstrap.js restores the theme before the CSS bundle loads. It reads
// the settings from `THEME_SETTINGS_KEY` and each slot's last background from
// `themeBackgrounds`, which applies only while the slot still holds that theme.
export const THEME_SETTINGS_KEY = "themeSettings"
const BACKGROUND_CACHE_KEY = "themeBackgrounds"

const backgroundEntrySchema = z.object({ theme: z.string(), background: z.string() })
const backgroundCacheSchema = z.object({
  light: backgroundEntrySchema.optional(),
  dark: backgroundEntrySchema.optional(),
})

export function cacheThemeBackground(slot: Appearance, theme: string, background: string) {
  try {
    const parsed = backgroundCacheSchema.safeParse(
      JSON.parse(localStorage.getItem(BACKGROUND_CACHE_KEY) ?? "{}"),
    )
    const cache = parsed.success ? parsed.data : {}
    const entry = cache[slot]
    if (entry?.theme === theme && entry.background === background) return
    localStorage.setItem(
      BACKGROUND_CACHE_KEY,
      JSON.stringify({ ...cache, [slot]: { theme, background } }),
    )
  } catch {}
}
