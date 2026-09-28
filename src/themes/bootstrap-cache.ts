import { z } from "zod"

import type { Appearance } from "@/themes/manifest"

// theme-bootstrap.js paints before React mounts from these: the theme to show
// for each OS appearance, and each theme's last background.
const THEMES_KEY = "themeByAppearance"
const BACKGROUNDS_KEY = "themeBackgrounds"

const backgroundCacheSchema = z.record(z.string(), z.string())

export function cacheBootThemes(themes: Record<Appearance, string>) {
  try {
    localStorage.setItem(THEMES_KEY, JSON.stringify(themes))
  } catch {}
}

export function cacheThemeBackground(theme: string, background: string) {
  try {
    const parsed = backgroundCacheSchema.safeParse(
      JSON.parse(localStorage.getItem(BACKGROUNDS_KEY) ?? "{}"),
    )
    const cache = parsed.success ? parsed.data : {}
    if (cache[theme] === background) return
    localStorage.setItem(BACKGROUNDS_KEY, JSON.stringify({ ...cache, [theme]: background }))
  } catch {}
}
