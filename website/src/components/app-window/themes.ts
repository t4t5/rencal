// The app's built-in themes as CSS variable maps, read from the app source at
// build time, so a theme registered in the manifest shows up automatically.
import { themes as appThemes } from "../../../../src/themes/manifest"

const themeFiles = import.meta.glob<string>("../../../../src/themes/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
})

export type ThemeVars = Record<string, string>

export function parseThemeCss(css: string): ThemeVars {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const vars: ThemeVars = {}
  for (const match of withoutComments.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[match[1]] = match[2].trim()
  }
  return vars
}

export const styleOf = (vars: ThemeVars) =>
  Object.entries(vars)
    .map(([name, value]) => `${name}: ${value}`)
    .join("; ")

// Most of ren's color primitives live in the app's global.css `:root` block
// (ren.css only sets its accents), so they're spelled out here. Keep in sync
// with the app's global.css.
export const REN_CORE: ThemeVars = {
  "--background": "#131313",
  "--foreground": "white",
  "--muted-foreground": "rgba(255, 255, 255, 0.5)",
  "--primary": "#f56313",
  "--surface-tint": "white",
  "--surface-tint-step": "5%",
}

const themeCss = (id: string) => {
  const css = themeFiles[`../../../../src/themes/${id}.css`]
  if (css === undefined) throw new Error(`Missing theme file for "${id}"`)
  return css
}

/** ren's own accents, applied on top of the `.rc-scope` defaults. */
export const REN_VARS = parseThemeCss(themeCss("ren"))

export const THEMES = appThemes.map((theme) => ({
  id: theme.id,
  name: theme.name,
  vars: { ...(theme.id === "ren" ? REN_CORE : {}), ...parseThemeCss(themeCss(theme.id)) },
}))
