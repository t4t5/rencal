import { listen } from "@tauri-apps/api/event"
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { rpc } from "@/rpc"
import type { ExternalTheme } from "@/rpc/bindings"

import { useOmarchyTheme } from "@/hooks/useOmarchyTheme"

import { BUILTIN_DESCRIPTORS, type ThemeDescriptor } from "@/themes/manifest"

const EXTERNAL_THEMES_CHANGED = "external-themes-changed"
const STYLE_ATTR = "data-external-theme"

// User themes are authored as bare declaration blocks; we add the
// `[data-theme="<id>"]` scope here (the same wrap the build-time plugin applies
// to built-in themes), keeping every injected theme isolated so the settings
// preview tiles can render inactive themes side by side.
function applyExternalThemes(themes: ExternalTheme[]) {
  const present = new Set(themes.map((t) => t.id))

  for (const theme of themes) {
    const selector = `style[${STYLE_ATTR}="${CSS.escape(theme.id)}"]`
    let el = document.head.querySelector<HTMLStyleElement>(selector)
    if (!el) {
      el = document.createElement("style")
      el.setAttribute(STYLE_ATTR, theme.id)
      document.head.appendChild(el)
    }
    const next = `[data-theme="${theme.id}"] {\n${theme.css}\n}`
    if (el.textContent !== next) el.textContent = next
  }

  // Drop styles for themes whose files were removed.
  for (const el of document.head.querySelectorAll<HTMLStyleElement>(`style[${STYLE_ATTR}]`)) {
    const id = el.getAttribute(STYLE_ATTR)
    if (id && !present.has(id)) el.remove()
  }
}

type ThemeRegistry = {
  descriptors: ThemeDescriptor[]
  externalThemes: ExternalTheme[]
}

const ThemeRegistryContext = createContext<ThemeRegistry | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [externalThemes, setExternalThemes] = useState<ExternalTheme[]>([])

  // Fetch + inject user themes, then keep them in sync with the on-disk folder.
  useEffect(() => {
    let cancelled = false

    const update = (themes: ExternalTheme[]) => {
      setExternalThemes(themes)
      applyExternalThemes(themes)
    }

    void rpc.themes.list_external().then((themes) => {
      if (!cancelled) update(themes)
    })

    const unlistenPromise = listen<ExternalTheme[]>(EXTERNAL_THEMES_CHANGED, (event) => {
      update(event.payload)
    })

    return () => {
      cancelled = true
      void unlistenPromise.then((fn) => fn())
    }
  }, [])

  // Omarchy's runtime palette injection lives here so it runs once per window,
  // not once per useTheme() call.
  useOmarchyTheme()

  const descriptors = useMemo<ThemeDescriptor[]>(
    () => [
      ...BUILTIN_DESCRIPTORS,
      ...externalThemes.map(
        (t): ThemeDescriptor => ({
          id: t.id,
          name: t.name,
          appearance: null,
          source: "external",
        }),
      ),
    ],
    [externalThemes],
  )

  const value = useMemo<ThemeRegistry>(
    () => ({ descriptors, externalThemes }),
    [descriptors, externalThemes],
  )

  return <ThemeRegistryContext.Provider value={value}>{children}</ThemeRegistryContext.Provider>
}

export function useThemeRegistry(): ThemeRegistry {
  const ctx = useContext(ThemeRegistryContext)
  if (!ctx) throw new Error("useThemeRegistry must be used within a ThemeProvider")
  return ctx
}
