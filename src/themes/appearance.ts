import { type Appearance, type ThemeId, getDeclaredAppearance } from "./manifest"

function hexLuminance(hex: string): number {
  const h = hex.replace("#", "").trim()
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

export function appearanceFromHex(hex: string): Appearance {
  return hexLuminance(hex) > 0.5 ? "light" : "dark"
}

// Reads the live `--background` token from the DOM. Used for themes whose
// appearance isn't declared statically (omarchy).
export function appearanceFromComputedBackground(): Appearance {
  const bg = getComputedStyle(document.body).getPropertyValue("--background").trim()
  if (bg.startsWith("#") && (bg.length === 7 || bg.length === 4)) {
    const hex = bg.length === 4 ? `#${bg[1]}${bg[1]}${bg[2]}${bg[2]}${bg[3]}${bg[3]}` : bg
    return appearanceFromHex(hex)
  }
  return "dark"
}

export function getActiveAppearance(id: ThemeId): Appearance {
  return getDeclaredAppearance(id) ?? appearanceFromComputedBackground()
}
