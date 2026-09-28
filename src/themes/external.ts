import type { ExternalTheme } from "@/lib/api"

import type { Appearance, ThemeDescriptor } from "@/themes/manifest"

const STYLE_ATTR = "data-external-theme"

// The wrapper supports declarations and nested selectors, but is not a security
// boundary: a closing brace can escape it. Only load the selected theme's CSS.
export function applyExternalThemes(themes: ExternalTheme[], active: string) {
  const theme = themes.find((theme) => theme.id === active)

  for (const element of document.head.querySelectorAll<HTMLStyleElement>(`style[${STYLE_ATTR}]`)) {
    if (element.getAttribute(STYLE_ATTR) !== theme?.id) element.remove()
  }

  if (theme) {
    const selector = `style[${STYLE_ATTR}="${CSS.escape(theme.id)}"]`
    let element = document.head.querySelector<HTMLStyleElement>(selector)
    if (!element) {
      element = document.createElement("style")
      element.setAttribute(STYLE_ATTR, theme.id)
      document.head.appendChild(element)
    }
    const next = `[data-theme="${CSS.escape(theme.id)}"] {\n${theme.css}\n}`
    if (element.textContent !== next) element.textContent = next
  }
}

// Parse as an inline declaration block on a detached element. Copy only custom
// properties to the preview's inline style; never insert preview CSS as rules.
export function externalThemePalette(css: string): Record<`--${string}`, string> {
  const declarations = document.createElement("div").style
  declarations.cssText = css
  const palette: Record<`--${string}`, string> = {}
  for (let i = 0; i < declarations.length; i++) {
    const name = declarations.item(i)
    if (name.startsWith("--")) {
      palette[name as `--${string}`] = declarations.getPropertyValue(name)
    }
  }
  return palette
}

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

// Reads a theme file's `--background`, for user themes that don't declare an
// appearance. Without one the theme falls back to the dark ren baseline.
function appearanceFromCss(css: string): Appearance {
  const background = externalThemePalette(css)["--background"]
  const rgb = background ? resolveColor(background) : null
  if (!rgb) return "dark"
  return luminance(...rgb) > 0.5 ? "light" : "dark"
}

export function externalThemeDescriptor(theme: ExternalTheme): ThemeDescriptor {
  return {
    id: theme.id,
    name: theme.name,
    appearance: theme.appearance ?? appearanceFromCss(theme.css),
    source: theme.source.kind === "plugin" ? "plugin" : "external",
  }
}
