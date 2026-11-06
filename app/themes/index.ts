/*
 * Draws a theme. `theme.json` is the baseline, with the derived tokens as var()
 * and color-mix(), so a theme only overrides primitives, as a `[data-theme]` CSS
 * rule did. What CSS derived with calc() is derived here, and `Backend.setTheme`
 * swaps the tokens natively.
 */
import { signal } from "nsh"
import { Backend } from "rencal/native"

import baseline from "@/theme.json"

import type { Appearance } from "./manifest"

const BASE_STEP = 5
const REM = 16

export type Vars = Record<string, string>

const BASELINE = baseline.cssVars.theme as Vars

/** Tokens CSS themes set that NSH has no use for: they're read here, not drawn. */
const UNDRAWN = [
  "surface-tint-step",
  "font-heading",
  "font-button",
  "font-numerical",
  "text-heading--transform",
  "text-button--transform",
  "text-numerical--transform",
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

const GENERIC_FAMILY = /^["']?(system-ui|sans-serif|ui-sans-serif|-apple-system)/

/** `font-mono` is what the app's headings, buttons and numbers are drawn with. */
function derivedFont(overrides: Vars): Vars {
  const family =
    overrides["font-button"] ?? overrides["font-heading"] ?? overrides["font-numerical"]
  if (!family || family.includes("--font-mono")) return {}
  const value = family.includes("--font-sans") ? (overrides["font-sans"] ?? "sans") : family
  return { "font-mono": GENERIC_FAMILY.test(value) ? "sans" : value }
}

/** The toast stands out by inverting on a light page. */
const derivedToast = (mode: Appearance): Vars =>
  mode === "light" ? { toast: "var(--foreground)", "toast-foreground": "var(--background)" } : {}

/** The theme file of `overrides` over the baseline. */
export function themeFile(overrides: Vars, mode: Appearance): string {
  const step = Number.parseFloat(overrides["surface-tint-step"] ?? "") || BASE_STEP
  const vars: Vars = {
    ...steppedBaseline(step),
    ...derivedRadii(overrides),
    ...derivedControls(overrides),
    ...derivedFont(overrides),
    ...derivedToast(mode),
    ...overrides,
  }
  for (const name of UNDRAWN) delete vars[name]
  return JSON.stringify({ cssVars: { theme: vars } })
}

/** `uppercase` unless the theme turned it off; themes set the three alike. */
const caseOf = (overrides: Vars) => {
  const transform = overrides["text-button--transform"] ?? overrides["text-heading--transform"]
  return transform === undefined || transform === "uppercase" ? "uppercase" : "normal-case"
}

const appearance = signal<Appearance>("dark")
const paintVersion = signal(0)
const textCase = signal<"uppercase" | "normal-case">("uppercase")

export const activeAppearance = () => appearance()

/** Changes when the theme does, for colors computed from its tokens. */
export const themeVersion = () => paintVersion()

/** The case class of what was `data-typography`; a theme decides it. */
export const displayCase = () => textCase()

export async function applyTheme(overrides: Vars, mode: Appearance): Promise<void> {
  await Backend.setTheme(themeFile(overrides, mode))
  appearance.set(mode)
  textCase.set(caseOf(overrides))
  paintVersion.update((version) => version + 1)
}

/** A theme's colors by token, for painting it without drawing the app with it. */
export function themeColors(overrides: Vars, mode: Appearance): Promise<Vars> {
  return Backend.themeColors(themeFile(overrides, mode), mode === "dark") as Promise<Vars>
}
