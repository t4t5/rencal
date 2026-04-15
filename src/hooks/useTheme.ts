import { useEffect } from "react"
import { z } from "zod"

import { useLocalStorage } from "@/hooks/useLocalStorage"

const themeSchema = z.enum(["classic", "ren"])
export type Theme = z.infer<typeof themeSchema>

export function useTheme() {
  const [theme, setTheme] = useLocalStorage("theme", themeSchema, "classic")

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  const toggleTheme = () => {
    setTheme(theme === "classic" ? "ren" : "classic")
  }

  return { theme, setTheme, toggleTheme }
}
