import { listen } from "@tauri-apps/api/event"
import { useEffect } from "react"

import { rpc } from "@/rpc"
import type { OmarchyColors } from "@/rpc/bindings"

import type { Theme } from "@/hooks/useTheme"

const OMARCHY_THEME_CHANGED = "omarchy-theme-changed"
const CACHE_KEY = "omarchyColors"

const CSS_VARS = [
  "--background",
  "--foreground",
  "--primary",
  "--today",
  "--highlight",
  "--hover-tint",
  "--muted",
  "--success",
  "--warning",
  "--error",
] as const

function varsFromColors(c: OmarchyColors): Record<(typeof CSS_VARS)[number], string> {
  return {
    "--background": c.background,
    "--foreground": c.foreground,
    "--primary": c.accent,
    "--today": c.color4,
    "--highlight": c.color1,
    "--hover-tint": c.foreground,
    "--muted": `color-mix(in srgb, ${c.foreground} 55%, transparent)`,
    "--success": c.color2,
    "--warning": c.color3,
    "--error": c.color1,
  }
}

function applyOmarchyColors(c: OmarchyColors) {
  const vars = varsFromColors(c)
  for (const [name, value] of Object.entries(vars)) {
    document.body.style.setProperty(name, value)
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {}
}

function clearOmarchyVars() {
  for (const name of CSS_VARS) {
    document.body.style.removeProperty(name)
  }
}

export function useOmarchyTheme(theme: Theme) {
  useEffect(() => {
    if (theme !== "omarchy") {
      clearOmarchyVars()
      return
    }

    let cancelled = false

    void rpc.omarchy.get_colors().then((colors) => {
      if (cancelled || !colors) return
      applyOmarchyColors(colors)
    })

    const unlistenPromise = listen<OmarchyColors>(OMARCHY_THEME_CHANGED, (event) => {
      applyOmarchyColors(event.payload)
    })

    return () => {
      cancelled = true
      void unlistenPromise.then((fn) => fn())
    }
  }, [theme])
}
