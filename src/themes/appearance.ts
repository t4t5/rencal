import { externalThemePalette } from "./external"
import { type Appearance, getDeclaredAppearance, type ThemeDescriptor } from "./manifest"

function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// Resolves any CSS colour to sRGB by painting it on a 1×1 canvas.
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
  return appearanceOfBackground(getComputedStyle(document.body).backgroundColor)
}

// Reads a theme file's `--background`, for user themes that don't declare an
// appearance. Without one the theme falls back to the dark ren baseline.
export function appearanceFromCss(css: string): Appearance {
  const background = externalThemePalette(css)["--background"]
  return background ? appearanceOfBackground(background) : "dark"
}

function appearanceOfBackground(css: string): Appearance {
  const rgb = resolveColor(css)
  if (!rgb) return "dark"
  return luminance(...rgb) > 0.5 ? "light" : "dark"
}

// Built-in and plugin themes declare their appearance; loose/omarchy themes
// derive it from the live --background once their styles are applied.
export function getActiveAppearance(
  id: string,
  descriptors: readonly ThemeDescriptor[],
): Appearance {
  return getDeclaredAppearance(id, descriptors) ?? appearanceFromComputedBackground()
}
