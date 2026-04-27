import { emit, listen } from "@tauri-apps/api/event"
import { useEffect, useRef } from "react"
import { z } from "zod"

import { rpc } from "@/rpc"
import { THEME_CHANGED } from "@/rpc/events"

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

// Single mutator for theme. localStorage is a flash-prevention cache;
// ~/.config/rencal/config.toml (via rpc.config) is canonical. To stay in
// sync, every set goes through `setTheme` below — nothing else writes
// either store. On mount we reconcile from TOML (TOML wins on conflict).
export function useTheme() {
  const [theme, setThemeLocal] = useLocalStorage("theme", themeSchema, getDefaultTheme())
  const themeRef = useRef(theme)
  themeRef.current = theme

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  useOmarchyTheme(theme)

  // Reconcile with TOML on mount; migrate cached value up if no file yet.
  useEffect(() => {
    let cancelled = false
    void rpc.config.get_theme().then((toml) => {
      if (cancelled) return
      if (toml === null) {
        // First run with this build: persist whatever the cache holds so the
        // file exists and future reads are unambiguous.
        void rpc.config.set_theme(themeRef.current)
        return
      }
      const parsed = themeSchema.safeParse(toml)
      if (parsed.success && parsed.data !== themeRef.current) {
        // TOML wins. Update cache + UI; don't re-write TOML.
        setThemeLocal(parsed.data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Cross-window sync. Don't re-emit — would loop.
  useEffect(() => {
    const unlistenPromise = listen<Theme>(THEME_CHANGED, (event) => {
      const parsed = themeSchema.safeParse(event.payload)
      if (parsed.success && parsed.data !== themeRef.current) {
        setThemeLocal(parsed.data)
      }
    })
    return () => {
      void unlistenPromise.then((fn) => fn())
    }
  }, [])

  const setTheme = (t: Theme) => {
    setThemeLocal(t)
    void rpc.config
      .set_theme(t)
      .then(() => {
        void emit(THEME_CHANGED, t)
      })
      .catch((err) => {
        console.error("Failed to persist theme:", err)
      })
  }

  const toggleTheme = () => {
    const i = THEME_IDS.indexOf(theme)
    setTheme(THEME_IDS[(i + 1) % THEME_IDS.length])
  }

  return { theme, setTheme, toggleTheme }
}
