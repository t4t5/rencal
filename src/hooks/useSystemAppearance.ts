import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState } from "react"

import type { Appearance } from "@/themes/manifest"

// Matches theme-bootstrap.js: the window is unforced at launch, so the media
// query reports the OS until something forces it.
function initialAppearance(): Appearance {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches === false ? "light" : "dark"
}

// The OS appearance, tracked only while `enabled`. Forcing the window's theme
// with `setTheme("dark")` also makes `theme()`, `onThemeChanged` and
// `prefers-color-scheme` report the forced value, so while enabled this hook
// hands the window back to the OS with `setTheme(null)`. The caller must not
// force the window theme while it's enabled.
export function useSystemAppearance(enabled: boolean): Appearance {
  const [appearance, setAppearance] = useState(initialAppearance)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const appWindow = getCurrentWindow()

    void appWindow
      .setTheme(null)
      .then(() => appWindow.theme())
      .then((theme) => {
        if (!cancelled && theme) setAppearance(theme)
      })
      .catch((err: unknown) => {
        console.error("Failed to read the system appearance:", err)
      })

    const unlistenPromise = appWindow.onThemeChanged(({ payload }) => {
      if (!cancelled) setAppearance(payload)
    })

    return () => {
      cancelled = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [enabled])

  return appearance
}
