import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useRef } from "react"
import { z } from "zod"

import { useLocalStorage } from "@/hooks/useLocalStorage"
import { useSystemAppearance } from "@/hooks/useSystemAppearance"
import { api, type ThemeSetting } from "@/lib/api"
import { emitAppEvent } from "@/lib/api/internal"
import { isMacOS } from "@/lib/utils"

import { useThemeRegistry } from "@/themes/ThemeRegistry"
import { getActiveAppearance, getPairAppearance } from "@/themes/appearance"
import { cacheThemeBackground } from "@/themes/background-cache"
import { applyExternalThemes } from "@/themes/external"
import { updateExternalFonts } from "@/themes/external-fonts"
import { DEFAULT_SYSTEM_THEMES, resolveThemeSetting, THEME_IDS } from "@/themes/manifest"

// A theme id (a built-in id or a user theme's `user:<slug>`), or a light and
// dark pair that follows the system appearance. An unknown id just renders
// the :root defaults, so no enum gate is needed.
const themeSettingSchema = z.union([z.string(), z.object({ light: z.string(), dark: z.string() })])

const sameSetting = (a: ThemeSetting, b: ThemeSetting) => JSON.stringify(a) === JSON.stringify(b)

function getDefaultTheme(): ThemeSetting {
  // Read default theme from index.html
  return document.body.dataset.defaultTheme || THEME_IDS[0]
}

// Single mutator for the theme setting. localStorage is a flash-prevention
// cache; ~/.config/rencal/config.toml (via rpc.config) is canonical. To stay
// in sync, every set goes through `setSetting` below — nothing else writes
// either store. On mount we reconcile from TOML (TOML wins on conflict).
export function useTheme() {
  const [setting, setSettingLocal] = useLocalStorage("theme", themeSettingSchema, getDefaultTheme())
  const { descriptors, externalThemes } = useThemeRegistry()
  const settingRef = useRef(setting)
  settingRef.current = setting

  const followsSystem = typeof setting !== "string"
  const systemAppearance = useSystemAppearance(followsSystem)
  const theme = resolveThemeSetting(setting, systemAppearance)

  useEffect(() => {
    document.body.dataset.theme = theme
    document.body.style.removeProperty("--background")
    applyExternalThemes(externalThemes, theme)
    updateExternalFonts(theme, externalThemes)
    // Expose the appearance to CSS (`data-appearance`) and sync OS window chrome.
    // Omarchy/user styles are injected async, hence the `descriptors` dependency;
    // useOmarchyTheme re-syncs once its colors arrive.
    const appearance = getActiveAppearance(theme, descriptors)
    document.body.dataset.appearance = appearance
    // A forced window stops reporting OS appearance changes, so a pair leaves
    // it to useSystemAppearance.
    if (!followsSystem) void getCurrentWindow().setTheme(appearance)
  }, [theme, descriptors, externalThemes, followsSystem])

  // Cache the resolved --background for index.html's flash-prevention.
  // Deferred by 1 frame so any runtime-injected user/omarchy styles are applied first.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const bg = getComputedStyle(document.body).getPropertyValue("--background").trim()
      if (bg) cacheThemeBackground(theme, bg)
    })
    return () => cancelAnimationFrame(raf)
  }, [theme, externalThemes])

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
        // and on macOS to a pair that follows the system appearance.
        let initial = settingRef.current
        const hadCachedTheme = localStorage.getItem("theme") !== null
        if (!hadCachedTheme) {
          try {
            const colors = await api.themes.getOmarchyColors()
            if (cancelled) return
            if (colors) initial = "omarchy"
            else if (isMacOS) initial = DEFAULT_SYSTEM_THEMES
            setSettingLocal(initial)
          } catch {}
        }
        void api.themes.setConfigured(initial)
        return
      }
      const parsed = themeSettingSchema.safeParse(toml)
      if (parsed.success && !sameSetting(parsed.data, settingRef.current)) {
        // TOML wins. Update cache + UI; don't re-write TOML.
        setSettingLocal(parsed.data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Cross-window sync. Don't re-emit — would loop.
  useEffect(() => {
    const unlistenPromise = api.notifications.listen("theme-changed", (event) => {
      const parsed = themeSettingSchema.safeParse(event)
      if (parsed.success && !sameSetting(parsed.data, settingRef.current)) {
        setSettingLocal(parsed.data)
      }
    })
    return () => {
      unlistenPromise.unlisten()
    }
  }, [])

  const setSetting = (next: ThemeSetting) => {
    setSettingLocal(next)
    void api.themes
      .setConfigured(next)
      .then(() => {
        void emitAppEvent("theme-changed", next)
      })
      .catch((err: unknown) => {
        console.error("Failed to persist theme:", err)
      })
  }

  // While following the system, a theme replaces the half of the pair that
  // matches its appearance. Omarchy fits neither half, so it replaces the pair.
  const selectTheme = (id: string) => {
    const current = settingRef.current
    const half =
      typeof current === "string" ? null : getPairAppearance(id, descriptors, externalThemes)
    setSetting(half && typeof current !== "string" ? { ...current, [half]: id } : id)
  }

  // Turning it on keeps the current theme in its half of the pair; turning it
  // off keeps whichever theme is showing.
  const setFollowSystem = (follow: boolean) => {
    if (!follow) return setSetting(theme)
    const half = getPairAppearance(theme, descriptors, externalThemes)
    setSetting(half ? { ...DEFAULT_SYSTEM_THEMES, [half]: theme } : DEFAULT_SYSTEM_THEMES)
  }

  // Cycle through every registered theme (built-in + user), in display order.
  // Picks a single theme, so it stops following the system.
  const toggleTheme = () => {
    const ids = descriptors.map((d) => d.id)
    if (ids.length === 0) return
    const i = ids.indexOf(theme)
    const next = ids[(i + 1) % ids.length]
    if (next) setSetting(next)
  }

  return { theme, setting, selectTheme, setFollowSystem, toggleTheme }
}
