/*
 * Text roles. Components name a role (`typography.caption()`), never a size. A
 * theme sets a role's size and line height (`--text-caption`,
 * `--text-caption--line-height`) and its face's font, case and weight
 * (`--font-heading`, `--text-heading--transform`, `--text-heading--font-weight`).
 * Unset, a role follows the primitive it stands for (`--text-caption` is
 * `--text-xs`), so a theme written for the Tailwind scale keeps its sizes.
 */
import { signal } from "nsh"

import { cn } from "@/lib/utils"

import type { Vars } from "./index"

type Face = "sans" | "heading" | "button" | "numerical"

/** Each role's face, and the tokens its size falls back through, first set wins. */
const ROLES = {
  body: { face: "sans", from: ["sm"] },
  "body-lg": { face: "sans", from: ["base"] },
  caption: { face: "sans", from: ["xs"] },
  micro: { face: "sans", from: ["2xs"] },
  section: { face: "heading", from: ["sm"] },
  title: { face: "heading", from: ["heading", "base"] },
  display: { face: "heading", from: ["heading", "2xl"] },
  button: { face: "button", from: ["sm"] },
  "button-sm": { face: "button", from: ["xs"] },
  numerical: { face: "numerical", from: ["xs"] },
  "numerical-sm": { face: "numerical", from: ["2xs"] },
  "numerical-lg": { face: "numerical", from: ["sm"] },
} as const satisfies Record<string, { face: Face; from: readonly string[] }>

type Role = keyof typeof ROLES

const DRAWN_FACES = ["heading", "button", "numerical"] as const
type DrawnFace = (typeof DRAWN_FACES)[number]

const DEFAULT_WEIGHT: Record<DrawnFace, string> = {
  heading: "font-normal",
  button: "font-medium",
  numerical: "font-normal",
}

const chain = (names: readonly string[], suffix: string): string =>
  names.reduceRight(
    (fallback, name) =>
      fallback ? `var(--text-${name}${suffix}, ${fallback})` : `var(--text-${name}${suffix})`,
    "",
  )

/** The roles' sizes and the faces' fonts when a theme doesn't set them, as var()s. */
export function typographyDefaults(): Vars {
  const vars: Vars = {}
  for (const [role, { from }] of Object.entries(ROLES)) {
    vars[`text-${role}`] = chain(from, "")
    vars[`text-${role}--line-height`] = chain(from, "--line-height")
  }
  for (const face of DRAWN_FACES) vars[`font-${face}`] = "var(--font-mono)"
  return vars
}

const CASES: Record<string, string> = {
  uppercase: "uppercase",
  lowercase: "lowercase",
  capitalize: "capitalize",
}

const WEIGHTS: [number, string][] = [
  [150, "font-thin"],
  [250, "font-extralight"],
  [350, "font-light"],
  [450, "font-normal"],
  [550, "font-medium"],
  [650, "font-semibold"],
  [750, "font-bold"],
  [850, "font-extrabold"],
  [Infinity, "font-black"],
]

function weightClass(value: string | undefined, fallback: string): string {
  if (value === undefined) return fallback
  const number = value === "bold" ? 700 : value === "normal" ? 400 : Number(value)
  if (Number.isNaN(number)) return fallback
  return WEIGHTS.find(([limit]) => number < limit)![1]
}

type FaceClasses = Record<DrawnFace, string>

/** Each face's case and weight classes; uppercase unless a theme turns it off. */
export function facesOf(overrides: Vars): FaceClasses {
  const classes = {} as FaceClasses
  for (const face of DRAWN_FACES) {
    const transform = overrides[`text-${face}--transform`]
    classes[face] = cn(
      `font-(family-name:--font-${face})`,
      transform === undefined ? "uppercase" : (CASES[transform] ?? "normal-case"),
      weightClass(overrides[`text-${face}--font-weight`], DEFAULT_WEIGHT[face]),
    )
  }
  return classes
}

const faces = signal<FaceClasses>(facesOf({}))

export const setFaces = (overrides: Vars) => faces.set(facesOf(overrides))

// Static strings, one per role, so every size class is written out once.
const SIZES: Record<Role, string> = {
  body: "text-(--text-body)/(--text-body--line-height)",
  "body-lg": "text-(--text-body-lg)/(--text-body-lg--line-height)",
  caption: "text-(--text-caption)/(--text-caption--line-height)",
  micro: "text-(--text-micro)/(--text-micro--line-height)",
  section: "text-(--text-section)/(--text-section--line-height)",
  title: "text-(--text-title)/(--text-title--line-height)",
  display: "text-(--text-display)/(--text-display--line-height)",
  button: "text-(--text-button)/(--text-button--line-height)",
  "button-sm": "text-(--text-button-sm)/(--text-button-sm--line-height)",
  numerical: "text-(--text-numerical)/(--text-numerical--line-height)",
  "numerical-sm": "text-(--text-numerical-sm)/(--text-numerical-sm--line-height)",
  "numerical-lg": "text-(--text-numerical-lg)/(--text-numerical-lg--line-height)",
}

const role = (name: Role) => () => {
  const face: Face = ROLES[name].face
  return cn(face === "sans" ? "font-sans" : faces()[face], SIZES[name])
}

/** A role's classes: its face's font, case and weight, and its size. */
export const typography = {
  body: role("body"),
  bodyLg: role("body-lg"),
  caption: role("caption"),
  micro: role("micro"),
  section: role("section"),
  title: role("title"),
  display: role("display"),
  button: role("button"),
  buttonSm: role("button-sm"),
  numerical: role("numerical"),
  numericalSm: role("numerical-sm"),
  numericalLg: role("numerical-lg"),
}
