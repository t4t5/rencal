import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState } from "react"

import type { Appearance } from "@/themes/manifest"

// Matches theme-bootstrap.js: the window is unforced at launch, so the media
// query reports the OS until something forces it.
function initialAppearance(): Appearance {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

// Owns the window's theme: forces it to `forced`, or with null hands it back to
// the OS and tracks the OS appearance. A forced window reports the forced value
// from `theme()`, `onThemeChanged` and `prefers-color-scheme`, so while forced
// this returns the last OS appearance read.
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
