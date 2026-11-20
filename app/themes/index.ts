/*
 * Draws a theme. `theme.json` is the baseline, with the derived tokens as var()
 * and color-mix(), so a theme only overrides primitives, as a `[data-theme]` CSS
 * rule did. What CSS derived with calc() is derived here, and NSH's `setTheme`
 * swaps the tokens natively.
 */
import { nativeModule, setTheme, signal, type Theme } from "nsh"

import { cn } from "@/lib/utils"

import baseline from "@/theme.json"

import type { Appearance } from "./manifest"
import { setFaces, typographyDefaults } from "./typography"

const BASE_STEP = 5
const REM = 16

export type Vars = Record<string, string>

const BASELINE = baseline.cssVars.theme as Vars

/** Drawn as classes (`surfacesOf`): NSH reads a lone `var()` as a color, so they stay out of its file. */
const SURFACE_TOKENS = ["button-shadow", "button-shadow-active", "control", "control-shadow"]

/** Tokens CSS themes set that NSH has no use for: they're read here, not drawn. */
const UNDRAWN = [
  "surface-tint-step",
  ...["heading", "button", "numerical"].flatMap((face) => [
    `text-${face}--transform`,
    `text-${face}--font-weight`,
    `text-${face}--letter-spacing`,
  ]),
]

function length(value: string | undefined): number | null {
  if (value === undefined) return null
  const number = Number.parseFloat(value)
  if (Number.isNaN(number)) return null
  return value.trim().endsWith("rem") ? number * REM : number
}

// The surfaces, and the white mixed into a fill to hover it. `--tooltip` has a
// fixed tint.
const stepped = (name: string, value: string) =>
  name !== "tooltip" && (value.includes("var(--surface-tint)") || value.includes("srgb, white"))

/** `--surface-tint-step` scales every surface mix; NSH's color-mix has no calc(). */
function steppedBaseline(step: number): Vars {
  if (step === BASE_STEP) return BASELINE
  return Object.fromEntries(
    Object.entries(BASELINE).map(([name, value]) => [
      name,
      stepped(name, value)
        ? value.replace(/(\d+(?:\.\d+)?)%/, (_, percent: string) => {
            return `${(Number(percent) * step) / BASE_STEP}%`
          })
        : value,
    ]),
  )
}

function derivedRadii(overrides: Vars): Vars {
  const radius = length(overrides.radius)
  if (radius === null) return {}
  return {
    "radius-xs": `${radius * 0.4}px`,
    "radius-sm": `${radius * 0.6}px`,
    "radius-md": `${radius * 0.8}px`,
    "radius-lg": `${radius}px`,
    "radius-xl": `${radius * 1.4}px`,
    // Square when --radius is 0, a pill otherwise.
    "radius-circle": `${radius * 1000}px`,
  }
}

function derivedControls(overrides: Vars): Vars {
  const height = length(overrides["control-height"])
  if (height === null) return {}
  return {
    "control-height-xs": `${height - 10}px`,
    "control-height-sm": `${height - 2}px`,
    "control-height-lg": `${height + 6}px`,
  }
}

const GENERIC_FAMILY = /^["']?(system-ui|sans-serif|ui-sans-serif|-apple-system)\b/

/**
 * NSH reads var() only in colors, so fonts and type sizes are resolved here:
 * `--font-heading: var(--font-sans)` takes that font, `--text-body` its size. A
 * font that is the system's is named `sans`, which NSH draws as it.
 */
function resolvedTypography(vars: Vars): Vars {
  const resolved: Vars = {}
  for (const [name, value] of Object.entries(vars)) {
    if (name.startsWith("font-")) {
      const font = resolveVars(value, vars)
      resolved[name] = name !== "font-sans" && (!font || GENERIC_FAMILY.test(font)) ? "sans" : font
    } else if (name.startsWith("text-") && value.includes("var(")) {
      resolved[name] = resolveVars(value, vars)
    }
  }
  return resolved
}

/** The toast stands out by inverting on a light page. */
const derivedToast = (mode: Appearance): Vars =>
  mode === "light" ? { toast: "var(--foreground)", "toast-foreground": "var(--background)" } : {}

/** Every token of `overrides` over the baseline, with what's derived from them. */
function allVars(overrides: Vars, mode: Appearance): Vars {
  const step = Number.parseFloat(overrides["surface-tint-step"] ?? "") || BASE_STEP
  const vars: Vars = {
    ...steppedBaseline(step),
    ...derivedRadii(overrides),
    ...derivedControls(overrides),
    ...derivedToast(mode),
    ...typographyDefaults(),
    ...overrides,
  }
  return { ...vars, ...resolvedTypography(vars) }
}

/** The theme file of `overrides` over the baseline. */
export function themeFile(overrides: Vars, mode: Appearance): Theme {
  const vars = allVars(overrides, mode)
  for (const name of [...UNDRAWN, ...SURFACE_TOKENS]) delete vars[name]
  return { cssVars: { theme: vars } }
}

/**
 * `value` with its `var()`s replaced, fallbacks (`var(--a, var(--b))`) too: an
 * unset name, or one that refers back to itself, takes its fallback, else "".
 */
export function resolveVars(
  value: string,
  vars: Vars,
  seen: ReadonlySet<string> = new Set(),
): string {
  let out = ""
  let index = 0
  for (;;) {
    const start = value.indexOf("var(", index)
    if (start < 0) return out + value.slice(index)
    let end = start + 3
    for (let depth = 0; end < value.length; end++) {
      if (value[end] === "(") depth++
      else if (value[end] === ")" && --depth === 0) break
    }
    const inner = value.slice(start + 4, end)
    const comma = inner.indexOf(",")
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim().replace(/^--/, "")
    const own = vars[name]
    const replacement =
      own !== undefined && !seen.has(name)
        ? resolveVars(own, vars, new Set([...seen, name]))
        : comma < 0
          ? ""
          : resolveVars(inner.slice(comma + 1).trim(), vars, seen)
    out += value.slice(index, start) + replacement
    index = end + 1
  }
}

/** An arbitrary class: `shadow-[inset_1px_1px_0_#fff,…]`. */
const arbitrary = (utility: string, value: string) =>
  `${utility}-[${value
    .trim()
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, "_")}]`

export type Surfaces = { button: string; control: string }

/**
 * Bevels and fills NSH has no token kind for: `--button-shadow` (pressed:
 * `--button-shadow-active`), and fields' `--control-shadow` and `--control`.
 * Each is a class only when the theme sets it, so other themes keep the kit's look.
 */
export function surfacesOf(overrides: Vars, mode: Appearance): Surfaces {
  const vars = allVars(overrides, mode)
  const own = (name: string, utility: string, variant = "") => {
    const value = overrides[name] && resolveVars(overrides[name], vars)
    return value && value !== "none" ? variant + arbitrary(utility, value) : ""
  }
  return {
    button: cn(own("button-shadow", "shadow"), own("button-shadow-active", "shadow", "active:")),
    control: cn(own("control", "bg"), own("control-shadow", "shadow")),
  }
}

const appearance = signal<Appearance>("dark")
const paintVersion = signal(0)
const surfaces = signal<Surfaces>({ button: "", control: "" })
const applied = signal<{ overrides: Vars; mode: Appearance } | null>(null)

/** A theme's button bevel, as classes ("" for none). */
export const buttonSurface = () => surfaces().button

/** A theme's field well, as classes ("" for none). */
export const controlSurface = () => surfaces().control

export const activeAppearance = () => appearance()

/** Changes when the theme does, for colors computed from its tokens. */
export const themeVersion = () => paintVersion()

/** The theme drawn now, for engines of their own (view plugins) to apply too. */
export const appliedTheme = () => applied()

export { typography } from "./typography"

export async function applyTheme(overrides: Vars, mode: Appearance): Promise<void> {
  const file = themeFile(overrides, mode)
  setTheme(file)
  applied.set({ overrides, mode })
  appearance.set(mode)
  setFaces(overrides)
  surfaces.set(surfacesOf(overrides, mode))
  paintVersion.update((version) => version + 1)
}

/** A theme's colors by token, for painting it without drawing the app with it. */
export function themeColors(overrides: Vars, mode: Appearance): Promise<Vars> {
  const file = JSON.stringify(themeFile(overrides, mode))
  // Looked up, not imported: view plugins' bundles can't import `rencal/native`.
  const { Backend } = nativeModule<{
    Backend: { themeColors(json: string, dark: boolean): Promise<unknown> }
  }>("rencal/native")
  return Backend.themeColors(file, mode === "dark") as Promise<Vars>
}
