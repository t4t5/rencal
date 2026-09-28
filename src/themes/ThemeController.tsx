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

import { cacheThemeBackground, THEME_SETTINGS_KEY } from "@/themes/bootstrap-cache"
import { applyExternalThemes } from "@/themes/external"
import { updateExternalFonts } from "@/themes/external-fonts"
import { getActiveAppearance, type ThemeDescriptor } from "@/themes/manifest"
import {
  activeSlot,
  cycleTheme,
  DEFAULT_THEME_SETTINGS,
  pickTheme,
  resolveSync,
  type ThemeSlot,
  withSlot,
} from "@/themes/theme-settings"

// Slots hold plain ids: an unknown id just renders the :root defaults, so no
// enum gate is needed.
const themeSettingsSchema = z.object({
  mode: z.enum(["system", "single"]),
  single: z.string(),
  light: z.string(),
  dark: z.string(),
})

const sameSettings = (a: ThemeSettings, b: ThemeSettings) =>
  a.mode === b.mode && a.single === b.single && a.light === b.light && a.dark === b.dark

type ThemeController = {
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

const ThemeControllerContext = createContext<ThemeController | null>(null)

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
  const shown = useMemo(() => resolveSync(settings, onOmarchy), [settings, onOmarchy])
  const syncsWithSystem = shown.mode === "system"
  const appearanceOf = (id: string) => getActiveAppearance(id, descriptors, omarchy?.mode ?? null)
  // An unknown theme (e.g. a user theme not loaded yet) renders the dark ren baseline.
  const singleAppearance = appearanceOf(shown.single) ?? "dark"
  // Syncing leaves the window to the OS; a single theme forces its appearance.
  const os = useWindowTheme(syncsWithSystem ? null : singleAppearance)
  const activeTheme = shown[activeSlot(shown, os)]
  const appearance = syncsWithSystem ? (appearanceOf(activeTheme) ?? os) : singleAppearance

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

  const value = useMemo<ThemeController>(() => {
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
      pickTheme: (id) => setSettings(pickTheme(settings, id, descriptors)),
      cycleTheme: () => setSettings(cycleTheme(shown, descriptors, os)),
    }
  }, [settings, shown, activeTheme, onOmarchy, descriptors, os, setSettingsLocal])

  return <ThemeControllerContext.Provider value={value}>{children}</ThemeControllerContext.Provider>
}

export function useTheme(): ThemeController {
  const ctx = useContext(ThemeControllerContext)
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider")
  return ctx
}
