/*
 * An event's colors, computed from its calendar's color: what global.css
 * derived with `oklch(from ...)` and `color-mix()`, which NSH's classes can't
 * take from a per-event value.
 */
import { token } from "nsh"

import { activeAppearance, themeVersion } from "@/themes"

export type EventPaint = {
  /** The marker and dots. */
  color: string
  /** A filled block. */
  fill: string
  selectedFill: string
  /** Text on the fill. */
  foreground: string
  /** A time beside the title, tinted to the calendar. */
  tinted: string
}

type Rgb = [number, number, number]

function parseHex(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})/i.exec(hex.trim())
  if (!match) return null
  const digits = match[1]!
  const full = digits.length === 3 ? digits.replace(/./g, "$&$&") : digits
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function toOklch([r, g, b]: Rgb): [number, number, number] {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(a, bb), Math.atan2(bb, a)]
}

function fromOklch([L, C, h]: [number, number, number]): Rgb {
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clamp = (c: number) => Math.min(1, Math.max(0, fromLinear(Math.max(0, c))))
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

const mix = (a: Rgb, b: Rgb, amount: number): Rgb =>
  a.map((channel, i) => channel * amount + b[i]! * (1 - amount)) as Rgb

const toCss = (rgb: Rgb) =>
  `#${rgb
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`

/** A color only some themes set, so it has no type of its own in `Tokens`. */
const themed = (name: string) => {
  const value = token(name as "foreground") as string | undefined
  return value === undefined ? null : parseHex(value)
}

const cache = new Map<string, EventPaint>()
let cachedFor = -1

/** The paint of events colored `color`; reading it follows the theme. */
export function eventPaint(color: string | null): EventPaint {
  const version = themeVersion()
  if (version !== cachedFor) {
    cache.clear()
    cachedFor = version
  }
  const key = color ?? ""
  const cached = cache.get(key)
  if (cached) return cached

  const background = parseHex(String(token("background"))) ?? [0.07, 0.07, 0.07]
  const foreground = parseHex(String(token("foreground"))) ?? [1, 1, 1]
  const source =
    themed("event-color") ||
    (color && parseHex(color)) ||
    parseHex(String(token("primary"))) ||
    foreground
  const dark = activeAppearance() === "dark"

  const [l, c, h] = toOklch(source)
  const boosted = fromOklch([l, c * 1.4, h])
  const tintedColor = fromOklch([dark ? l : Math.min(l, 0.45), c * 1.4, h])
  const tinted = dark ? mix(foreground, tintedColor, 0.6) : tintedColor
  const surface = themed("event-tint-surface") ?? background
  const fill = themed("event-background") ?? mix(boosted, surface, 0.2)
  const onFill = themed("event-foreground")

  const paint: EventPaint = {
    color: toCss(source),
    fill: toCss(fill),
    selectedFill: toCss(mix(fill, onFill ?? foreground, 0.8)),
    foreground: toCss(onFill ?? tinted),
    tinted: toCss(tinted),
  }
  cache.set(key, paint)
  return paint
}
