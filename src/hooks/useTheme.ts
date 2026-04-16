import { useEffect } from "react"
import { z } from "zod"

import { useLocalStorage } from "@/hooks/useLocalStorage"

const themeSchema = z.enum(["classic", "ren"])
export type Theme = z.infer<typeof themeSchema>

function getDefaultTheme(): Theme {
  // Read default theme from index.html
  const theme = document.body.dataset.defaultTheme
  const parsed = themeSchema.safeParse(theme)
  return parsed.success ? parsed.data : "ren"
}

export function useTheme() {
  const [theme, setTheme] = useLocalStorage("theme", themeSchema, getDefaultTheme())

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  const toggleTheme = () => {
    setTheme(theme === "classic" ? "ren" : "classic")
  }

  return { theme, setTheme, toggleTheme }
}
