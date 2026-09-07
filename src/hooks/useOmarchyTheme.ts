import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect } from "react"

import { rpc } from "@/rpc"
import type { OmarchyColors } from "@/rpc/bindings"

const OMARCHY_THEME_CHANGED = "omarchy-theme-changed"
const CACHE_KEY = "omarchyColors"
const STYLE_ELEMENT_ID = "omarchy-theme-vars"

// Omarchy themes built around a single hue (or none at all). Their palette
// still names a red, green, blue, etc., but those are all shades of the same
// colour, so the per-calendar event colours would be the only thing clashing
// with the desktop. These get the Electric Blue treatment instead (see
// electric-blue.css): the accent for every emphasis, and every event painted
// in it. Keyed by the theme slug Omarchy writes to `current/theme.name`.
const MONOCHROME_THEMES: ReadonlySet<string> = new Set(["vantablack", "white", "solitude", "lumon"])

const CSS_VARS = [
  "--background",
  "--foreground",
  "--primary",
  "--today",
  "--highlight",
  "--hover-tint",
  "--muted",
  "--popover-tint",
  "--success",
  "--warning",
  "--error",
  "--event-color",
  "--event-background",
  "--event-foreground",
] as const

// Partial: the event vars are only set for monochrome themes. Leaving them
// out lets the per-calendar colours show through, as for any other theme.
type OmarchyVars = Partial<Record<(typeof CSS_VARS)[number], string>>

function luminance(hex: string): number {
  const h = hex.replace("#", "")
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// Some Omarchy themes set `bright_foreground` to a brighter variant of the body text
// (tokyo-night, catppuccin), others to an accent tint (catppuccin-latte's
// rosewater, rose-pine's pale gray) that reads poorly as primary text.
// Pick whichever foreground variant contrasts the background more.
function pickForeground(c: OmarchyColors): string {
  const bg = luminance(c.background)
  const fgContrast = Math.abs(luminance(c.foreground) - bg)
  const brightFgContrast = Math.abs(luminance(c.bright_foreground) - bg)
  return brightFgContrast > fgContrast ? c.bright_foreground : c.foreground
}

function isMonochrome(c: OmarchyColors): boolean {
  return c.name !== null && MONOCHROME_THEMES.has(c.name)
}

function varsFromColors(c: OmarchyColors): OmarchyVars {
  const fg = pickForeground(c)
  const popoverTint = c.mode === "light" ? "white" : "black"
  const vars: OmarchyVars = {
    "--background": c.background,
    "--foreground": fg,
    "--primary": c.accent,
    "--today": c.blue,
    "--highlight": c.red,
    "--hover-tint": fg,
    "--muted": `color-mix(in srgb, ${fg} 55%, transparent)`,
    "--popover-tint": popoverTint,
    "--success": c.green,
    "--warning": c.yellow,
    "--error": c.red,
  }
  if (!isMonochrome(c)) return vars
  // Mirror electric-blue.css: one colour for every emphasis, and events as a
  // solid accent fill with background-coloured text. Success / warning / error
  // keep the palette's shades so response states stay distinguishable.
  return {
    ...vars,
    "--today": c.accent,
    "--highlight": c.accent,
    "--hover-tint": c.accent,
    "--event-color": c.accent,
    "--event-background": c.accent,
    "--event-foreground": c.background,
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
  // do this itself because the appearance comes from Omarchy's palette.
  if (document.body.dataset.theme === "omarchy") {
    document.body.dataset.appearance = c.mode
    void getCurrentWindow().setTheme(c.mode)
    // Keep index.html's flash-prevention cache in step with the live OS theme.
    try {
      localStorage.setItem("themeBackground", c.background)
    } catch {}
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
