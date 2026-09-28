import { z } from "zod"

// theme-bootstrap.js restores the theme before the CSS bundle loads. It reads
// the settings from `THEME_SETTINGS_KEY` and the theme's last background from
// `themeBackgrounds`.
export const THEME_SETTINGS_KEY = "themeSettings"
const BACKGROUND_CACHE_KEY = "themeBackgrounds"

const backgroundCacheSchema = z.record(z.string(), z.string())

export function cacheThemeBackground(theme: string, background: string) {
  try {
    const parsed = backgroundCacheSchema.safeParse(
      JSON.parse(localStorage.getItem(BACKGROUND_CACHE_KEY) ?? "{}"),
    )
    const cache = parsed.success ? parsed.data : {}
    if (cache[theme] === background) return
    localStorage.setItem(BACKGROUND_CACHE_KEY, JSON.stringify({ ...cache, [theme]: background }))
  } catch {}
}
