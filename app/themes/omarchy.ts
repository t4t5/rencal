/* The theme painted from the desktop's palette, read from Omarchy's colors.toml. */
import type { OmarchyColors } from "@/lib/api"

// Single-hue Omarchy themes, styled like electric-blue: accent everywhere,
// events included. Keyed by the slug in `current/theme.name`.
const MONOCHROME_THEMES: ReadonlySet<string> = new Set(["vantablack", "white", "solitude", "lumon"])

function luminance(hex: string): number {
  const h = hex.replace("#", "")
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// Some Omarchy themes set `bright_foreground` to a brighter variant of the body
// text, others to an accent tint that reads poorly as primary text. Pick whichever
// contrasts the background more.
function pickForeground(c: OmarchyColors): string {
  const bg = luminance(c.background)
  const fgContrast = Math.abs(luminance(c.foreground) - bg)
  const brightFgContrast = Math.abs(luminance(c.bright_foreground) - bg)
  return brightFgContrast > fgContrast ? c.bright_foreground : c.foreground
}

// Palettes can be light or dark, so each fill's text comes from the palette.
function readableOn(fill: string, c: OmarchyColors, fg: string): string {
  const fillLuminance = luminance(fill)
  return Math.abs(luminance(c.background) - fillLuminance) >=
    Math.abs(luminance(fg) - fillLuminance)
    ? c.background
    : fg
}

const isMonochrome = (c: OmarchyColors) => c.name !== null && MONOCHROME_THEMES.has(c.name)

export function omarchyVars(c: OmarchyColors): Record<string, string> {
  const fg = pickForeground(c)
  const vars = {
    background: c.background,
    foreground: fg,
    primary: c.accent,
    "primary-foreground": readableOn(c.accent, c, fg),
    today: c.blue,
    "today-foreground": readableOn(c.blue, c, fg),
    brand: c.red,
    "brand-foreground": readableOn(c.red, c, fg),
    "surface-tint": fg,
    "muted-foreground": `color-mix(in srgb, ${fg} 55%, transparent)`,
    success: c.green,
    warning: c.yellow,
    destructive: c.red,
    "destructive-foreground": readableOn(c.red, c, fg),
  }
  if (!isMonochrome(c)) return vars
  return {
    ...vars,
    today: c.accent,
    "today-foreground": readableOn(c.accent, c, fg),
    brand: c.accent,
    "brand-foreground": readableOn(c.accent, c, fg),
    "surface-tint": c.accent,
    "event-color": c.accent,
    "event-background": c.accent,
    "event-foreground": c.background,
  }
}
