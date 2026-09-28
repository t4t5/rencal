import type { ExternalTheme } from "@/lib/api"

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

// Dark unless the colour resolves to a light one; an unparseable colour
// (e.g. a `var()`) paints the canvas default black.
function appearanceOfColor(css: string): Appearance {
  const rgb = resolveColor(css)
  if (!rgb) return "dark"
  return luminance(...rgb) > 0.5 ? "light" : "dark"
}

// Reads the rendered body background (`bg-background`). Used for themes whose
// appearance isn't declared statically (omarchy, user themes).
export function appearanceFromComputedBackground(): Appearance {
  return appearanceOfColor(getComputedStyle(document.body).backgroundColor)
}

// The half of a light/dark pair a theme fills: its declared appearance, or a
// loose theme's `--background`. Omarchy fills neither: it follows Omarchy's
// own theme and forces the window to match.
export function getPairAppearance(
  id: string,
  descriptors: readonly ThemeDescriptor[],
  externalThemes: readonly ExternalTheme[],
): Appearance | null {
  if (id === "omarchy") return null
  const declared = getDeclaredAppearance(id, descriptors)
  if (declared) return declared
  const css = externalThemes.find((theme) => theme.id === id)?.css
  const background = css && externalThemePalette(css)["--background"]
  return background ? appearanceOfColor(background) : "dark"
}

// Built-in and plugin themes declare their appearance; loose/omarchy themes
// derive it from the live --background once their styles are applied.
export function getActiveAppearance(
  id: string,
  descriptors: readonly ThemeDescriptor[],
): Appearance {
  return getDeclaredAppearance(id, descriptors) ?? appearanceFromComputedBackground()
}
