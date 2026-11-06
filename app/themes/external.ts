/*
 * Loose and plugin themes. A theme file is the body of a CSS rule: its custom
 * properties become tokens. Selectors nested in it have nothing to style here,
 * as there's no CSS, so they're dropped and counted for the Themes page to report.
 */
import type { ExternalTheme } from "@/lib/api"

import type { ThemeDescriptor } from "@/themes/manifest"

export type ExternalThemeVars = {
  vars: Record<string, string>
  /** Nested rules, which NSH can't draw. */
  selectors: number
}

export function parseThemeCss(css: string): ExternalThemeVars {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const vars: Record<string, string> = {}
  let selectors = 0
  let declaration = ""
  let depth = 0

  const declare = () => {
    const match = /^\s*--([\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(declaration)
    if (match) vars[match[1]!] = match[2]!.replace(/\s+/g, " ")
    declaration = ""
  }

  for (const char of source) {
    if (char === "{") {
      if (depth === 0) {
        selectors += 1
        declaration = ""
      }
      depth += 1
    } else if (char === "}") {
      depth = Math.max(0, depth - 1)
    } else if (depth === 0) {
      if (char === ";") declare()
      else declaration += char
    }
  }
  declare()
  return { vars, selectors }
}

export function externalThemeDescriptor(theme: ExternalTheme): ThemeDescriptor {
  return {
    id: theme.id,
    name: theme.name,
    appearance: theme.appearance,
    source: theme.source.kind === "plugin" ? "plugin" : "external",
  }
}
