import { useEffect } from "react"
import { z } from "zod"

import { useLocalStorage } from "@/hooks/useLocalStorage"
import { useOmarchyTheme } from "@/hooks/useOmarchyTheme"

import { THEME_IDS, type ThemeId } from "@/themes/manifest"

const themeSchema = z.enum(THEME_IDS)
export type Theme = ThemeId

function getDefaultTheme(): Theme {
  // Read default theme from index.html
  const theme = document.body.dataset.defaultTheme
  const parsed = themeSchema.safeParse(theme)
  return parsed.success ? parsed.data : THEME_IDS[0]
}

export function useTheme() {
  const [theme, setTheme] = useLocalStorage("theme", themeSchema, getDefaultTheme())

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  useOmarchyTheme(theme)

  const toggleTheme = () => {
    const i = THEME_IDS.indexOf(theme)
    setTheme(THEME_IDS[(i + 1) % THEME_IDS.length])
  }

  return { theme, setTheme, toggleTheme }
}
