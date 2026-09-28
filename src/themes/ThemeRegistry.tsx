import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { useOmarchyTheme } from "@/hooks/useOmarchyTheme"
import {
  api,
  type ExternalTheme,
  type ExternalThemeError,
  type ExternalThemesSnapshot,
} from "@/lib/api"

import { ThemeController } from "@/themes/ThemeController"
import { externalThemeDescriptor } from "@/themes/external"
import { disposeExternalFonts } from "@/themes/external-fonts"
import { BUILTIN_DESCRIPTORS, type ThemeDescriptor } from "@/themes/manifest"

type ThemeRegistry = {
  descriptors: ThemeDescriptor[]
  externalThemes: ExternalTheme[]
  errors: ExternalThemeError[]
}

const ThemeRegistryContext = createContext<ThemeRegistry | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [externalThemes, setExternalThemes] = useState<ExternalTheme[]>([])
  const [errors, setErrors] = useState<ExternalThemeError[]>([])

  useEffect(() => disposeExternalFonts, [])

  // Fetch loose and plugin themes, then keep them in sync with disk.
  useEffect(() => {
    let cancelled = false

    const update = (snapshot: ExternalThemesSnapshot) => {
      setExternalThemes(snapshot.themes)
      setErrors(snapshot.errors)
    }

    void api.themes.listExternal().then((snapshot) => {
      if (!cancelled) update(snapshot)
    })

    const unlistenPromise = api.notifications.listen("external-themes-changed", (event) => {
      update(event)
    })

    return () => {
      cancelled = true
      unlistenPromise.unlisten()
    }
  }, [])

  // Omarchy's runtime palette injection lives here so it runs once per window.
  const omarchy = useOmarchyTheme()
  const onOmarchy = omarchy !== null

  // The Omarchy theme only has a palette to paint with on an Omarchy desktop.
  const descriptors = useMemo<ThemeDescriptor[]>(
    () => [
      ...BUILTIN_DESCRIPTORS.filter((theme) => onOmarchy || theme.id !== "omarchy"),
      ...externalThemes.map(externalThemeDescriptor),
    ],
    [externalThemes, onOmarchy],
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
