import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect } from "react"

import { rpc } from "@/rpc"
import type { OmarchyColors } from "@/rpc/bindings"

import { appearanceFromHex } from "@/themes/appearance"

const OMARCHY_THEME_CHANGED = "omarchy-theme-changed"
const CACHE_KEY = "omarchyColors"
const STYLE_ELEMENT_ID = "omarchy-theme-vars"

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

function luminance(hex: string): number {
  const h = hex.replace("#", "")
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// Some Omarchy themes set `cursor` to a brighter variant of the body text
// (tokyo-night, catppuccin), others to an accent tint (catppuccin-latte's
// rosewater, rose-pine's pale gray) that reads poorly as primary text.
// Pick whichever of cursor/foreground contrasts the background more.
function pickForeground(c: OmarchyColors): string {
  if (!c.cursor) return c.foreground
  const bg = luminance(c.background)
  const fgContrast = Math.abs(luminance(c.foreground) - bg)
  const cursorContrast = Math.abs(luminance(c.cursor) - bg)
  return cursorContrast > fgContrast ? c.cursor : c.foreground
}

function varsFromColors(c: OmarchyColors): Record<(typeof CSS_VARS)[number], string> {
  const fg = pickForeground(c)
  return {
    "--background": c.background,
    "--foreground": fg,
    "--primary": c.accent,
    "--today": c.color4,
    "--highlight": c.color1,
    "--hover-tint": fg,
    "--muted": `color-mix(in srgb, ${fg} 55%, transparent)`,
    "--success": c.color2,
    "--warning": c.color3,
    "--error": c.color1,
  }
}

function ensureStyleElement(): HTMLStyleElement {
  let el = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement("style")
    el.id = STYLE_ELEMENT_ID
    document.head.appendChild(el)
  }
  return el
}

function applyOmarchyColors(c: OmarchyColors) {
  const vars = varsFromColors(c)
  const declarations = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n")
  ensureStyleElement().textContent = `[data-theme="omarchy"] {\n${declarations}\n}`
  // index.html's flash-prevention sets some of these as inline body styles
  // before React mounts. Clear them so the stylesheet rule wins from now on.
  for (const name of CSS_VARS) {
    document.body.style.removeProperty(name)
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {}
  // Sync OS window chrome if omarchy is the active theme. useTheme can't
  // do this itself because the appearance is derived from these colors.
  if (document.body.dataset.theme === "omarchy") {
    void getCurrentWindow().setTheme(appearanceFromHex(c.background))
  }
}

// Always-on: fetch + listen regardless of the active theme so the omarchy
// preview tile in settings reflects the current OS theme. The
// [data-theme="omarchy"] selector ensures the rule only paints elements
// that actually opt in.
export function useOmarchyTheme() {
  useEffect(() => {
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
  }, [])
}
