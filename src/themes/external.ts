import type { ExternalTheme } from "@/lib/api"

import type { ThemeDescriptor } from "@/themes/manifest"

const STYLE_ATTR = "data-external-theme"

// External themes are authored as bare declaration blocks. Scope each theme so
// previews can render inactive palettes alongside the active one.
export function applyExternalThemes(themes: ExternalTheme[]) {
  const present = new Set(themes.map((theme) => theme.id))

  for (const theme of themes) {
    const selector = `style[${STYLE_ATTR}="${CSS.escape(theme.id)}"]`
    let element = document.head.querySelector<HTMLStyleElement>(selector)
    if (!element) {
      element = document.createElement("style")
      element.setAttribute(STYLE_ATTR, theme.id)
      document.head.appendChild(element)
    }
    const next = `[data-theme="${theme.id}"] {\n${theme.css}\n}`
    if (element.textContent !== next) element.textContent = next
  }

  for (const element of document.head.querySelectorAll<HTMLStyleElement>(`style[${STYLE_ATTR}]`)) {
    const id = element.getAttribute(STYLE_ATTR)
    if (id && !present.has(id)) element.remove()
  }
}

export function externalThemeDescriptor(theme: ExternalTheme): ThemeDescriptor {
  return {
    id: theme.id,
    name: theme.name,
    appearance: theme.appearance,
    source: theme.source.kind === "plugin" ? "plugin" : "external",
  }
}
