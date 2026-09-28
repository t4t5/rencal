import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useRef } from "react"
import { z } from "zod"

import { useLocalStorage } from "@/hooks/useLocalStorage"
import { useSystemAppearance } from "@/hooks/useSystemAppearance"
import { type AppearanceSetting, api, type ThemeSettings } from "@/lib/api"
import { emitAppEvent } from "@/lib/api/internal"
import { isMacOS } from "@/lib/utils"

import { useThemeRegistry } from "@/themes/ThemeRegistry"
import { getActiveAppearance } from "@/themes/appearance"
import { cacheThemeBackground, cacheThemeVariants } from "@/themes/bootstrap-cache"
import { applyExternalThemes } from "@/themes/external"
import { updateExternalFonts } from "@/themes/external-fonts"
import { getThemeFamilies, hasVariants, resolveFamilyTheme, THEME_IDS } from "@/themes/manifest"

// Theme id is a plain string: a family id (a built-in id or a user theme's
// `user:<slug>`). An unknown id just renders the :root defaults, so no enum
// gate is needed.
const themeSchema = z.string()
const appearanceSchema = z.enum(["light", "dark", "system"])
const themeSettingsSchema = z.object({ theme: themeSchema, appearance: appearanceSchema })

// Matches the config default, so a config from before the setting keeps its look.
const DEFAULT_APPEARANCE: AppearanceSetting = "dark"

const sameSettings = (a: ThemeSettings, b: ThemeSettings) =>
  a.theme === b.theme && a.appearance === b.appearance

function getDefaultTheme(): string {
  // Read default theme from index.html
  return document.body.dataset.defaultTheme || THEME_IDS[0]
}

// Single mutator for the theme settings. localStorage is a flash-prevention
// cache; ~/.config/rencal/config.toml (via rpc.config) is canonical. To stay
// in sync, every set goes through `setSettings` below — nothing else writes
// either store. On mount we reconcile from TOML (TOML wins on conflict).
export function useTheme() {
  const [theme, setThemeLocal] = useLocalStorage("theme", themeSchema, getDefaultTheme())
  const [appearance, setAppearanceLocal] = useLocalStorage(
    "appearance",
    appearanceSchema,
    DEFAULT_APPEARANCE,
  )
  const { descriptors, externalThemes } = useThemeRegistry()
  const settingsRef = useRef<ThemeSettings>({ theme, appearance })
  settingsRef.current = { theme, appearance }

  const setSettingsLocal = (next: ThemeSettings) => {
    setThemeLocal(next.theme)
    setAppearanceLocal(next.appearance)
  }

  // Only a family with light and dark variants follows the system; any other
  // theme forces the window to its one appearance.
  const followsSystem = appearance === "system" && hasVariants(theme)
  const systemAppearance = useSystemAppearance(followsSystem)
  const activeTheme = resolveFamilyTheme(
    theme,
    appearance === "system" ? systemAppearance : appearance,
  )

  useEffect(() => {
    document.body.dataset.theme = activeTheme
    document.body.style.removeProperty("--background")
    applyExternalThemes(externalThemes, activeTheme)
    updateExternalFonts(activeTheme, externalThemes)
    // Expose the appearance to CSS (`data-appearance`) and sync OS window chrome.
    // Omarchy/user styles are injected async, hence the `descriptors` dependency;
    // useOmarchyTheme re-syncs once its colors arrive.
    const active = getActiveAppearance(activeTheme, descriptors)
    document.body.dataset.appearance = active
    // A forced window stops reporting OS appearance changes, so a family that
    // follows the system leaves it to useSystemAppearance.
    if (!followsSystem) void getCurrentWindow().setTheme(active)
  }, [activeTheme, descriptors, externalThemes, followsSystem])

  // The theme theme-bootstrap.js restores for each OS appearance.
  useEffect(() => {
    cacheThemeVariants({
      light: resolveFamilyTheme(theme, appearance === "dark" ? "dark" : "light"),
      dark: resolveFamilyTheme(theme, appearance === "light" ? "light" : "dark"),
    })
  }, [theme, appearance])

  // Cache the resolved --background for index.html's flash-prevention.
  // Deferred by 1 frame so any runtime-injected user/omarchy styles are applied first.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const bg = getComputedStyle(document.body).getPropertyValue("--background").trim()
      if (bg) cacheThemeBackground(activeTheme, bg)
    })
    return () => cancelAnimationFrame(raf)
  }, [activeTheme, externalThemes])

  // Reconcile with TOML on mount; migrate cached value up if no file yet.
  useEffect(() => {
    let cancelled = false
    void api.themes.getConfigured().then(async (toml) => {
      if (cancelled) return
      if (toml === null) {
        // First run with this build: persist whatever the cache holds so the
        // file exists and future reads are unambiguous. On a truly fresh
        // install (no prior localStorage either), default to omarchy when
        // detected on disk so Omarchy users see their OS theme out of the box,
        // and on macOS follow the system appearance.
        let initial = settingsRef.current
        const hadCachedTheme = localStorage.getItem("theme") !== null
        if (!hadCachedTheme) {
          try {
            const colors = await api.themes.getOmarchyColors()
            if (cancelled) return
            if (colors) initial = { ...initial, theme: "omarchy" }
            else if (isMacOS) initial = { ...initial, appearance: "system" }
            setSettingsLocal(initial)
          } catch {}
        }
        void api.themes.setConfigured(initial)
        return
      }
      const parsed = themeSettingsSchema.safeParse(toml)
      if (parsed.success && !sameSettings(parsed.data, settingsRef.current)) {
        // TOML wins. Update cache + UI; don't re-write TOML.
        setSettingsLocal(parsed.data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Cross-window sync. Don't re-emit — would loop.
  useEffect(() => {
    const unlistenPromise = api.notifications.listen("theme-changed", (event) => {
      const parsed = themeSettingsSchema.safeParse(event)
      if (parsed.success && !sameSettings(parsed.data, settingsRef.current)) {
        setSettingsLocal(parsed.data)
      }
    })
    return () => {
      unlistenPromise.unlisten()
    }
  }, [])

  const setSettings = (next: ThemeSettings) => {
    setSettingsLocal(next)
    void api.themes
      .setConfigured(next)
      .then(() => {
        void emitAppEvent("theme-changed", next)
      })
      .catch((err: unknown) => {
        console.error("Failed to persist theme:", err)
      })
  }

  const setTheme = (id: string) => setSettings({ ...settingsRef.current, theme: id })

  const setAppearance = (next: AppearanceSetting) =>
    setSettings({ ...settingsRef.current, appearance: next })

  // Cycle through every registered theme family (built-in + user), in display order.
  const toggleTheme = () => {
    const ids = getThemeFamilies(descriptors).map((f) => f.id)
    if (ids.length === 0) return
    const i = ids.indexOf(settingsRef.current.theme)
    const next = ids[(i + 1) % ids.length]
    if (next) setTheme(next)
  }

  return { theme, appearance, setSettings, setTheme, setAppearance, toggleTheme }
}
