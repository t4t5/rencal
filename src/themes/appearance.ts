import { type Appearance, getDeclaredAppearance } from "./manifest"

function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// Resolves any CSS colour the engine understands (`white`, `rgb()`, `oklch()`,
// `color-mix()`, …) to sRGB by painting it on a 1×1 canvas.
function resolveColor(css: string): [number, number, number] | null {
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return null
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  if (r === undefined || g === undefined || b === undefined || a === 0) return null
  return [r, g, b]
}

// Reads the rendered body background (`bg-background`). Used for themes whose
// appearance isn't declared statically (omarchy, user themes).
export function appearanceFromComputedBackground(): Appearance {
  const rgb = resolveColor(getComputedStyle(document.body).backgroundColor)
  if (!rgb) return "dark"
  return luminance(...rgb) > 0.5 ? "light" : "dark"
}

// Built-in themes declare their appearance; user/omarchy themes derive it from
// the live --background once their styles are applied.
export function getActiveAppearance(id: string): Appearance {
  return getDeclaredAppearance(id) ?? appearanceFromComputedBackground()
}
