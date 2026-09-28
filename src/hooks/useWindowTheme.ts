import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState } from "react"

import type { Appearance } from "@/themes/manifest"

// The window is unforced at launch, so this is the OS appearance.
function initialAppearance(): Appearance {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

// Forces the window's theme, or with null hands it back to the OS and tracks
// it. A forced window hides the OS appearance, so while forced this returns the
// last one read.
export function useWindowTheme(forced: Appearance | null): Appearance {
  const [os, setOs] = useState(initialAppearance)

  useEffect(() => {
    const appWindow = getCurrentWindow()
    const logError = (err: unknown) => console.error("Failed to set the window theme:", err)
    if (forced) {
      void appWindow.setTheme(forced).catch(logError)
      return
    }

    let cancelled = false
    void appWindow
      .setTheme(null)
      .then(() => appWindow.theme())
      .then((theme) => {
        if (!cancelled && theme) setOs(theme)
      })
      .catch(logError)

    const unlistenPromise = appWindow.onThemeChanged(({ payload }) => {
      if (!cancelled) setOs(payload)
    })

    return () => {
      cancelled = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [forced])

  return os
}
