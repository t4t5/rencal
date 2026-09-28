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

let canvas: CanvasRenderingContext2D | null | undefined

// Resolves any CSS colour to sRGB by painting it on a 1×1 canvas.
function resolveColor(css: string): [number, number, number] | null {
  canvas ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  if (!canvas) return null
  canvas.clearRect(0, 0, 1, 1)
  // An unparseable colour leaves fillStyle as is, so it paints nothing.
  canvas.fillStyle = "transparent"
  canvas.fillStyle = css
  canvas.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data
  if (r === undefined || g === undefined || b === undefined || a === 0) return null
  return [r, g, b]
}

// Resolves the palette's `--background` on a hidden probe scoped like a preview
// tile, so var() and color-mix() see the theme's and the baseline's tokens.
function resolvedBackground(id: string, palette: Record<`--${string}`, string>): string {
  const probe = document.createElement("div")
  probe.hidden = true
  probe.dataset.theme = id
  for (const [name, value] of Object.entries(palette)) probe.style.setProperty(name, value)
  probe.style.backgroundColor = "var(--background)"
  document.body.append(probe)
  const background = getComputedStyle(probe).backgroundColor
  probe.remove()
  return background
}

// For user themes that don't declare an appearance. Without a `--background`
// the theme falls back to the dark ren baseline.
function appearanceFromCss(id: string, css: string): Appearance {
  const palette = externalThemePalette(css)
  if (!palette["--background"]) return "dark"
  const rgb = resolveColor(resolvedBackground(id, palette))
  if (!rgb) return "dark"
  return luminance(...rgb) > 0.5 ? "light" : "dark"
}

export function externalThemeDescriptor(theme: ExternalTheme): ThemeDescriptor {
  return {
    id: theme.id,
    name: theme.name,
    appearance: theme.appearance ?? appearanceFromCss(theme.id, theme.css),
    source: theme.source.kind === "plugin" ? "plugin" : "external",
  }
}
