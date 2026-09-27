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
    const next = externalThemeRules(theme)
    if (element.textContent !== next) element.textContent = next
  }
}

// A theme with both variants gets one rule per variant; useTheme sets
// `data-appearance` on <body> to pick between them.
function externalThemeRules({ id, variants }: ExternalTheme): string {
  const scope = `[data-theme="${CSS.escape(id)}"]`
  if (variants.kind === "single") return `${scope} {\n${variants.css}\n}`
  return [
    `${scope}[data-appearance="light"] {\n${variants.light}\n}`,
    `${scope}[data-appearance="dark"] {\n${variants.dark}\n}`,
  ].join("\n\n")
}

/** The CSS a preview of `appearance` should use. Single-variant themes have one. */
export function externalThemeCss({ variants }: ExternalTheme, appearance: Appearance): string {
  if (variants.kind === "single") return variants.css
  return appearance === "light" ? variants.light : variants.dark
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

export function externalThemeDescriptor(theme: ExternalTheme): ThemeDescriptor {
  return {
    id: theme.id,
    name: theme.name,
    appearance: theme.variants.kind === "both" ? "both" : theme.variants.appearance,
    source: theme.source.kind === "plugin" ? "plugin" : "external",
  }
}
