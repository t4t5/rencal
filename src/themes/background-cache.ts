import { z } from "zod"

// theme-bootstrap.js paints the cached background of the theme it restores
// before the CSS bundle loads. Keyed by theme id: a light/dark pair can switch
// themes with the OS while renCal is closed.
const BACKGROUND_CACHE_KEY = "themeBackgrounds"

const cacheSchema = z.record(z.string(), z.string())

export function cacheThemeBackground(themeId: string, background: string) {
  try {
    const parsed = cacheSchema.safeParse(
      JSON.parse(localStorage.getItem(BACKGROUND_CACHE_KEY) ?? "{}"),
    )
    const cache = parsed.success ? parsed.data : {}
    if (cache[themeId] === background) return
    localStorage.setItem(BACKGROUND_CACHE_KEY, JSON.stringify({ ...cache, [themeId]: background }))
  } catch {}
}
