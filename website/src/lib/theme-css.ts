// Parsing for renCal theme files: a bare block of custom-property declarations
// with optional `@name` / `@appearance` comments (see src/themes/README.md).
export type ThemeVars = Record<string, string>
export type Appearance = "light" | "dark"

export function parseThemeCss(css: string): ThemeVars {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const vars: ThemeVars = {}
  for (const match of withoutComments.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[match[1]] = match[2].trim()
  }
  return vars
}

export function parseThemeMeta(css: string): { name?: string; appearance?: Appearance } {
  const name = css.match(/\/\*\s*@name\s+(.+?)\s*\*\//)?.[1]
  const appearance = css.match(/\/\*\s*@appearance\s+(light|dark)\s*\*\//)?.[1] as
    | Appearance
    | undefined
  return { name, appearance }
}
