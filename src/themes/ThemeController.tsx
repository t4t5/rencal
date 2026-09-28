import { getCurrentWindow } from "@tauri-apps/api/window"
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react"
import { z } from "zod"

import { useLocalStorage } from "@/hooks/useLocalStorage"
import { useSystemAppearance } from "@/hooks/useSystemAppearance"
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
import {
  type Appearance,
  APPEARANCES,
  DEFAULT_THEME_SETTINGS,
  getActiveAppearance,
  getDeclaredAppearance,
  type ThemeDescriptor,
} from "@/themes/manifest"
import {
  cycleTheme,
  followsSystem,
  pickTheme,
  resolveTheme,
  withSlot,
} from "@/themes/theme-settings"

// Slots hold plain ids: an unknown id just renders the :root defaults, so no
// enum gate is needed.
const themeSettingsSchema = z.object({
  mode: z.enum(["system", "light", "dark"]),
  light: z.string(),
  dark: z.string(),
})

const sameSettings = (a: ThemeSettings, b: ThemeSettings) =>
  a.mode === b.mode && a.light === b.light && a.dark === b.dark

type ThemeController = {
  settings: ThemeSettings
  activeTheme: string
  activeSlot: Appearance
  setSettings: (next: ThemeSettings) => void
  setSlot: (slot: Appearance, id: string) => void
  setMode: (mode: ThemeMode) => void
  /** Show a theme now (command palette). */
  pickTheme: (id: string) => void
  /** The active slot's next theme (shortcut). */
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
  const os = useSystemAppearance(followsSystem(settings))
  const resolved = resolveTheme(settings, os)
  const { activeSlot, activeTheme } = resolved
  // An unknown theme (e.g. a user theme not loaded yet) takes its slot's appearance.
  const appearance =
    getActiveAppearance(activeTheme, descriptors, omarchy?.mode ?? null) ?? activeSlot

  const stateRef = useRef({ settings, os, descriptors })
  stateRef.current = { settings, os, descriptors }

  useEffect(() => {
    document.body.dataset.theme = activeTheme
    document.body.style.removeProperty("--background")
    applyExternalThemes(externalThemes, activeTheme)
    updateExternalFonts(activeTheme, externalThemes)
  }, [activeTheme, externalThemes])

  // A forced window reports the forced value to `theme()`, `onThemeChanged` and
  // `prefers-color-scheme`, so while following the OS useSystemAppearance owns it.
  useEffect(() => {
    document.body.dataset.appearance = appearance
    if (!resolved.followsSystem) void getCurrentWindow().setTheme(appearance)
  }, [appearance, resolved.followsSystem])

  // Cache the resolved --background for theme-bootstrap.js under every slot
  // showing this theme. Deferred by 1 frame so injected external/Omarchy styles apply first.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const bg = getComputedStyle(document.body).getPropertyValue("--background").trim()
      if (!bg) return
      for (const slot of APPEARANCES) {
        if (settings[slot] === activeTheme) cacheThemeBackground(slot, activeTheme, bg)
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [activeTheme, settings, externalThemes, omarchy])

  // Omarchy can change while it sits in the inactive slot.
  useEffect(() => {
    if (!omarchy) return
    for (const slot of APPEARANCES) {
      if (settings[slot] === "omarchy") cacheThemeBackground(slot, "omarchy", omarchy.background)
    }
  }, [omarchy, settings])

  // Reconcile with TOML on mount; write the cached settings up if no file yet.
  useEffect(() => {
    let cancelled = false
    const hadCachedSettings = localStorage.getItem(THEME_SETTINGS_KEY) !== null
    void api.themes.getConfigured().then(async (toml) => {
      if (cancelled) return
      if (toml === null) {
        // On a truly fresh install, default to omarchy when detected on disk
        // so Omarchy users see their OS theme out of the box.
        let initial = stateRef.current.settings
        if (!hadCachedSettings) {
          try {
            const colors = await api.themes.getOmarchyColors()
            if (cancelled) return
            if (colors) initial = { ...initial, light: "omarchy", dark: "omarchy" }
            setSettingsLocal(initial)
          } catch {}
        }
        void api.themes.setConfigured(initial)
        return
      }
      const parsed = themeSettingsSchema.safeParse(toml)
      if (parsed.success && !sameSettings(parsed.data, stateRef.current.settings)) {
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
      if (parsed.success && !sameSettings(parsed.data, stateRef.current.settings)) {
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
    const current = () => stateRef.current

    return {
      settings,
      activeTheme,
      activeSlot,
      setSettings,
      setSlot: (slot, id) => setSettings(withSlot(current().settings, slot, id)),
      setMode: (mode) => setSettings({ ...current().settings, mode }),
      pickTheme: (id) => {
        const { settings, os, descriptors } = current()
        setSettings(pickTheme(settings, id, getDeclaredAppearance(id, descriptors), os))
      },
      cycleTheme: () => {
        const { settings, os, descriptors } = current()
        setSettings(cycleTheme(settings, descriptors, os))
      },
    }
  }, [settings, activeTheme, activeSlot, setSettingsLocal])

  return <ThemeControllerContext.Provider value={value}>{children}</ThemeControllerContext.Provider>
}

export function useTheme(): ThemeController {
  const ctx = useContext(ThemeControllerContext)
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider")
  return ctx
}
