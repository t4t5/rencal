import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useRef } from "react"
import { z } from "zod"

import { useLocalStorage } from "@/hooks/useLocalStorage"
import { rencal } from "@/lib/api"
import { emitAppEvent } from "@/lib/api/internal"

import { useThemeRegistry } from "@/themes/ThemeRegistry"
import { getActiveAppearance } from "@/themes/appearance"
import { THEME_IDS } from "@/themes/manifest"

// Theme id is a plain string: a built-in id or a user theme's `user:<slug>`.
// An unknown id just renders the :root defaults, so no enum gate is needed.
const themeSchema = z.string()
export type Theme = string

// index.html reads this to paint the right background before the CSS bundle loads.
const BACKGROUND_CACHE_KEY = "themeBackground"

function getDefaultTheme(): Theme {
  // Read default theme from index.html
  return document.body.dataset.defaultTheme || THEME_IDS[0]
}

// Single mutator for theme. localStorage is a flash-prevention cache;
// ~/.config/rencal/config.toml (via rpc.config) is canonical. To stay in
// sync, every set goes through `setTheme` below — nothing else writes
// either store. On mount we reconcile from TOML (TOML wins on conflict).
export function useTheme() {
  const [theme, setThemeLocal] = useLocalStorage("theme", themeSchema, getDefaultTheme())
  const { descriptors } = useThemeRegistry()
  const themeRef = useRef(theme)
  themeRef.current = theme

  useEffect(() => {
    document.body.dataset.theme = theme
    document.body.style.removeProperty("--background")
    // Expose the appearance to CSS (`data-appearance`) and sync OS window chrome.
    // Omarchy/user styles are injected async, hence the `descriptors` dependency;
    // useOmarchyTheme re-syncs once its colors arrive.
    const appearance = getActiveAppearance(theme)
    document.body.dataset.appearance = appearance
    void getCurrentWindow().setTheme(appearance)
  }, [theme, descriptors])

  // Cache the resolved --background for index.html's flash-prevention.
  // Deferred by 1 frame so any runtime-injected user/omarchy styles are applied first.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const bg = getComputedStyle(document.body).getPropertyValue("--background").trim()
      if (bg) {
        try {
          localStorage.setItem(BACKGROUND_CACHE_KEY, bg)
        } catch {}
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [theme])

  // Reconcile with TOML on mount; migrate cached value up if no file yet.
  useEffect(() => {
    let cancelled = false
    void rencal.themes.getConfigured().then(async (toml) => {
      if (cancelled) return
      if (toml === null) {
        // First run with this build: persist whatever the cache holds so the
        // file exists and future reads are unambiguous. On a truly fresh
        // install (no prior localStorage either), default to omarchy when
        // detected on disk so Omarchy users see their OS theme out of the box.
        let initial = themeRef.current
        const hadCachedTheme = localStorage.getItem("theme") !== null
        if (!hadCachedTheme) {
          try {
            const colors = await rencal.themes.getOmarchyColors()
            if (cancelled) return
            if (colors) {
              initial = "omarchy"
              setThemeLocal(initial)
            }
          } catch {}
        }
        void rencal.themes.setConfigured(initial)
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
    const unlistenPromise = rencal.notifications.listen("theme-changed", (event) => {
      const parsed = themeSchema.safeParse(event)
      if (parsed.success && parsed.data !== themeRef.current) {
        setThemeLocal(parsed.data)
      }
    })
    return () => {
      unlistenPromise.unlisten()
    }
  }, [])

  const setTheme = (t: Theme) => {
    setThemeLocal(t)
    void rencal.themes
      .setConfigured(t)
      .then(() => {
        void emitAppEvent("theme-changed", t)
      })
      .catch((err: unknown) => {
        console.error("Failed to persist theme:", err)
      })
  }

  // Cycle through every registered theme (built-in + user), in display order.
  const toggleTheme = () => {
    const ids = descriptors.map((d) => d.id)
    if (ids.length === 0) return
    const i = ids.indexOf(themeRef.current)
    const next = ids[(i + 1) % ids.length]
    if (next) setTheme(next)
  }

  return { theme, setTheme, toggleTheme }
}
