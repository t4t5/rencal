import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { useOmarchyTheme } from "@/hooks/useOmarchyTheme"
import {
  api,
  type ExternalTheme,
  type ExternalThemeError,
  type ExternalThemesSnapshot,
} from "@/lib/api"
import { logger } from "@/lib/logger"

import { ThemeController } from "@/themes/ThemeController"
import { externalThemeDescriptor } from "@/themes/external"
import { disposeExternalFonts } from "@/themes/external-fonts"
import { BUILTIN_DESCRIPTORS, omarchyDescriptor, type ThemeDescriptor } from "@/themes/manifest"

type ThemeRegistry = {
  descriptors: ThemeDescriptor[]
  externalThemes: ExternalTheme[]
  errors: ExternalThemeError[]
}

const ThemeRegistryContext = createContext<ThemeRegistry | null>(null)

// Loaded before the first render so an external active theme paints without a
// flash of the ren baseline.
export async function preloadExternalThemes(): Promise<ExternalThemesSnapshot> {
  try {
    return await api.themes.listExternal()
  } catch (err) {
    logger.error("Failed to load external themes", err)
    return { themes: [], errors: [] }
  }
}

export function ThemeProvider({
  initialExternalThemes,
  children,
}: {
  initialExternalThemes: ExternalThemesSnapshot
  children: ReactNode
}) {
  const [externalThemes, setExternalThemes] = useState<ExternalTheme[]>(
    initialExternalThemes.themes,
  )
  const [errors, setErrors] = useState<ExternalThemeError[]>(initialExternalThemes.errors)

  useEffect(() => disposeExternalFonts, [])

  // Keep loose and plugin themes in sync with disk.
  useEffect(() => {
    const unlistenPromise = api.notifications.listen("external-themes-changed", (event) => {
      setExternalThemes(event.themes)
      setErrors(event.errors)
    })
    return () => {
      unlistenPromise.unlisten()
    }
  }, [])

  // Omarchy's runtime palette injection lives here so it runs once per window.
  const omarchy = useOmarchyTheme()
  const omarchyMode = omarchy?.mode ?? null

  // The Omarchy theme only has a palette to paint with on an Omarchy desktop.
  const descriptors = useMemo<ThemeDescriptor[]>(
    () => [
      ...(omarchyMode ? [omarchyDescriptor(omarchyMode)] : []),
      ...BUILTIN_DESCRIPTORS,
      ...externalThemes.map(externalThemeDescriptor),
    ],
    [externalThemes, omarchyMode],
  )

  const value = useMemo<ThemeRegistry>(
    () => ({ descriptors, externalThemes, errors }),
    [descriptors, errors, externalThemes],
  )

  return (
    <ThemeRegistryContext.Provider value={value}>
      <ThemeController descriptors={descriptors} externalThemes={externalThemes} omarchy={omarchy}>
        {children}
      </ThemeController>
    </ThemeRegistryContext.Provider>
  )
}

export function useThemeRegistry(): ThemeRegistry {
  const ctx = useContext(ThemeRegistryContext)
  if (!ctx) throw new Error("useThemeRegistry must be used within a ThemeProvider")
  return ctx
}
