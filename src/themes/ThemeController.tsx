import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react"
import { z } from "zod"

import { useLocalStorage } from "@/hooks/useLocalStorage"
import { useWindowTheme } from "@/hooks/useWindowTheme"
import {
  api,
  type ExternalTheme,
  type OmarchyColors,
  type ThemeMode,
  type ThemeSettings,
} from "@/lib/api"
import { emitAppEvent } from "@/lib/api/internal"

import { cacheBootThemes, cacheThemeBackground } from "@/themes/bootstrap-cache"
import { applyExternalThemes } from "@/themes/external"
import { updateExternalFonts } from "@/themes/external-fonts"
import { getDeclaredAppearance, type ThemeDescriptor } from "@/themes/manifest"
import {
  cycleTheme,
  DEFAULT_THEME_SETTINGS,
  forcedTheme,
  pickTheme,
  type ThemeSlot,
  withSlot,
} from "@/themes/theme-settings"

const THEME_SETTINGS_KEY = "themeSettings"

// Slots hold plain ids: an unknown id just renders the :root defaults, so no
// enum gate is needed.
const themeSettingsSchema = z.object({
  mode: z.enum(["system", "single"]),
  single: z.string(),
  light: z.string(),
  dark: z.string(),
}) satisfies z.ZodType<ThemeSettings>

const sameSettings = (a: ThemeSettings, b: ThemeSettings) =>
  (Object.keys(a) as (keyof ThemeSettings)[]).every((key) => a[key] === b[key])

type ThemeControllerValue = {
  settings: ThemeSettings
  activeTheme: string
  /** Omarchy is installed, so syncing follows its theme. */
  onOmarchy: boolean
  setMode: (mode: ThemeMode) => void
  setSlot: (slot: ThemeSlot, id: string) => void
  /** Show a theme as the single theme, or sync for Omarchy (command palette). */
  pickTheme: (id: string) => void
  /** The showing slot's next theme (shortcut). */
  cycleTheme: () => void
}

const ThemeControllerContext = createContext<ThemeControllerValue | null>(null)

// Owns the theme settings and applies them, once per window. localStorage is a
// flash-prevention cache; ~/.config/rencal/config.toml (via rpc.config) is
// canonical. Every set goes through `setSettings`, and on mount we reconcile
// from TOML (TOML wins on conflict).
export function ThemeController({
  descriptors,
  externalThemes,
  omarchy,
  children,
}: {
  descriptors: ThemeDescriptor[]
  externalThemes: ExternalTheme[]
  omarchy: OmarchyColors | null
  children: ReactNode
}) {
  const [settings, setSettingsLocal] = useLocalStorage(
    THEME_SETTINGS_KEY,
    themeSettingsSchema,
    DEFAULT_THEME_SETTINGS,
  )
  const onOmarchy = omarchy !== null
  const forced = forcedTheme(settings, onOmarchy)
  const appearanceOf = (id: string) => getDeclaredAppearance(id, descriptors)
  // An unknown theme (e.g. a user theme not loaded yet) renders the dark ren baseline.
  const forcedAppearance = forced === null ? null : (appearanceOf(forced) ?? "dark")
  const os = useWindowTheme(forcedAppearance)
  const activeTheme = forced ?? settings[os]
  const appearance = forcedAppearance ?? appearanceOf(activeTheme) ?? os

  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    document.body.dataset.theme = activeTheme
    document.body.style.removeProperty("--background")
    applyExternalThemes(externalThemes, activeTheme)
    updateExternalFonts(activeTheme, externalThemes)
  }, [activeTheme, externalThemes])

  useEffect(() => {
    document.body.dataset.appearance = appearance
  }, [appearance])

  // The theme theme-bootstrap.js shows at next launch, per OS appearance.
  const bootLight = forced ?? settings.light
  const bootDark = forced ?? settings.dark
  useEffect(() => {
    cacheBootThemes({ light: bootLight, dark: bootDark })
  }, [bootLight, bootDark])

  // Cache the resolved --background for theme-bootstrap.js. Deferred by 1
  // frame so injected external/Omarchy styles apply first.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const bg = getComputedStyle(document.body).getPropertyValue("--background").trim()
      if (bg) cacheThemeBackground(activeTheme, bg)
    })
    return () => cancelAnimationFrame(raf)
  }, [activeTheme, externalThemes, omarchy])

  // Reconcile with TOML on mount; write the cached settings up if no file yet.
  useEffect(() => {
    let cancelled = false
    void api.themes.getConfigured().then((toml) => {
      if (cancelled) return
      if (toml === null) {
        void api.themes.setConfigured(settingsRef.current)
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
  }, [setSettingsLocal])

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
  }, [setSettingsLocal])

  const value = useMemo<ThemeControllerValue>(() => {
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

    return {
      settings,
      activeTheme,
      onOmarchy,
      setMode: (mode) => setSettings({ ...settings, mode }),
      setSlot: (slot, id) => setSettings(withSlot(settings, slot, id)),
      pickTheme: (id) => setSettings(pickTheme(settings, id)),
      cycleTheme: () => setSettings(cycleTheme(settings, descriptors, onOmarchy, os)),
    }
  }, [settings, activeTheme, onOmarchy, descriptors, os, setSettingsLocal])

  return <ThemeControllerContext.Provider value={value}>{children}</ThemeControllerContext.Provider>
}

export function useTheme(): ThemeControllerValue {
  const ctx = useContext(ThemeControllerContext)
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider")
  return ctx
}
