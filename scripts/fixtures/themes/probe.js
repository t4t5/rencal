// Runs inside headless Chromium (see dump.sh). Reads the computed value of every
// documented theme token for each built-in theme, the Omarchy samples, and the
// derived event paint for sample accents, then writes JSON into <pre id="out">.
/* global document, getComputedStyle, window */

const COLOR_VARS = [
  "background",
  "foreground",
  "muted-foreground",
  "placeholder-foreground",
  "surface-tint",
  "primary",
  "primary-hover",
  "primary-foreground",
  "today",
  "today-foreground",
  "brand",
  "brand-hover",
  "brand-foreground",
  "weekend",
  "card",
  "card-foreground",
  "card-muted-foreground",
  "popover",
  "popover-foreground",
  "popover-muted-foreground",
  "sidebar",
  "tooltip",
  "tooltip-foreground",
  "tooltip-muted-foreground",
  "toast",
  "toast-foreground",
  "toast-muted-foreground",
  "overlay",
  "border",
  "input",
  "ring",
  "button-border",
  "hover",
  "secondary",
  "secondary-hover",
  "secondary-foreground",
  "secondary-muted-foreground",
  "accent",
  "accent-foreground",
  "accent-muted-foreground",
  "selected",
  "selected-foreground",
  "selected-muted-foreground",
  "muted",
  "control-active-background",
  "control-active-border",
  "success",
  "warning",
  "destructive",
  "destructive-hover",
  "destructive-foreground",
  "event-color",
  "event-background",
  "event-foreground",
  "event-tint-surface",
]

const LENGTH_VARS = [
  "radius",
  "radius-circle",
  "control-height",
  "control-height-xs",
  "control-height-sm",
  "control-height-lg",
  "control-padding-inline",
  "control-content-gap",
  "control-row-gap",
  "control-leading-size",
  "control-trailing-inset",
  "layout-padding",
  "nav-padding-inline",
  "month-padding-inline",
  "event-padding-inline",
  "lane-height",
  ...["2xs", "xs", "sm", "base", "lg", "xl", "2xl"].flatMap((s) => [
    `text-${s}`,
    `text-${s}--line-height`,
  ]),
  ...["heading", "button", "numerical"].flatMap((r) => [
    `text-${r}`,
    `text-${r}--line-height`,
    `text-${r}--letter-spacing`,
  ]),
]

const RAW_VARS = [
  "surface-tint-step",
  "scrollbar-width",
  "font-sans",
  "font-mono",
  "font-body",
  "font-heading",
  "font-button",
  "font-numerical",
  "week-grid-background",
  ...["heading", "button", "numerical"].flatMap((r) => [
    `text-${r}--transform`,
    `text-${r}--font-weight`,
  ]),
  "calendar-event-text-max-lightness",
  "calendar-event-text-foreground-mix",
]

const EVENT_ACCENTS = [
  "#f56313",
  "#3a93ff",
  "#4caf50",
  "#e25252",
  "#9c27b0",
  "#ffeb3b",
  "#00bcd4",
  "#795548",
  "#7287fd",
  "#000000",
  "#ffffff",
]

// Mirror of varsFromColors in src/hooks/useOmarchyTheme.ts.
const MONOCHROME_THEMES = new Set(["vantablack", "white", "solitude", "lumon"])
function luminance(hex) {
  const h = hex.replace("#", "")
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}
function pickForeground(c) {
  const bg = luminance(c.background)
  return Math.abs(luminance(c.bright_foreground) - bg) > Math.abs(luminance(c.foreground) - bg)
    ? c.bright_foreground
    : c.foreground
}
function readableOn(fill, c, fg) {
  const l = luminance(fill)
  return Math.abs(luminance(c.background) - l) >= Math.abs(luminance(fg) - l) ? c.background : fg
}
function omarchyVars(c) {
  const fg = pickForeground(c)
  const vars = {
    "--background": c.background,
    "--foreground": fg,
    "--primary": c.accent,
    "--primary-foreground": readableOn(c.accent, c, fg),
    "--today": c.blue,
    "--today-foreground": readableOn(c.blue, c, fg),
    "--brand": c.red,
    "--brand-foreground": readableOn(c.red, c, fg),
    "--surface-tint": fg,
    "--muted-foreground": `color-mix(in srgb, ${fg} 55%, transparent)`,
    "--success": c.green,
    "--warning": c.yellow,
    "--destructive": c.red,
    "--destructive-foreground": readableOn(c.red, c, fg),
  }
  if (c.name === null || !MONOCHROME_THEMES.has(c.name)) return vars
  return {
    ...vars,
    "--today": c.accent,
    "--today-foreground": readableOn(c.accent, c, fg),
    "--brand": c.accent,
    "--brand-foreground": readableOn(c.accent, c, fg),
    "--surface-tint": c.accent,
    "--event-color": c.accent,
    "--event-background": c.accent,
    "--event-foreground": c.background,
  }
}

// ---- colour parsing (computed colours come back as rgb(), color(srgb), oklch(), ...)

function linToSrgb(x) {
  const s = Math.sign(x)
  const a = Math.abs(x)
  return s * (a <= 0.0031308 ? 12.92 * a : 1.055 * Math.pow(a, 1 / 2.4) - 0.055)
}
function oklabToSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  return [
    linToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}
function num(token) {
  if (token === "none") return 0
  if (token.endsWith("%")) return parseFloat(token) / 100
  return parseFloat(token)
}
function parseColor(str) {
  const m = str.match(/^([a-z-]+)\((.*)\)$/)
  if (!m) throw new Error(`unparsed colour: ${str}`)
  const [, fn, body] = m
  const [main, alphaPart] = body.split("/")
  const parts = main.replace(/,/g, " ").trim().split(/\s+/)
  let alpha = alphaPart === undefined ? 1 : num(alphaPart.trim())
  if ((fn === "rgb" || fn === "rgba") && parts.length === 4) alpha = num(parts.pop())
  let rgb
  if (fn === "rgb" || fn === "rgba") {
    rgb = parts.map((p) => (p.endsWith("%") ? num(p) : parseFloat(p) / 255))
  } else if (fn === "color") {
    if (parts[0] !== "srgb") throw new Error(`colour space: ${str}`)
    rgb = parts.slice(1).map(num)
  } else if (fn === "oklch") {
    const [L, C, H] = parts.map(num)
    const h = (H * Math.PI) / 180
    rgb = oklabToSrgb(L, C * Math.cos(h), C * Math.sin(h))
  } else if (fn === "oklab") {
    rgb = oklabToSrgb(...parts.map(num))
  } else {
    throw new Error(`colour function: ${str}`)
  }
  return { rgb, alpha }
}
function toHex({ rgb, alpha }) {
  const byte = (v) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0")
  return `#${rgb.map(byte).join("")}${byte(alpha)}`
}
function colorEntry(str) {
  const parsed = parseColor(str)
  return { hex: toHex(parsed), raw: str }
}

// ---- probing

function rawVar(el, name) {
  return getComputedStyle(el).getPropertyValue(`--${name}`).trim()
}
function isUnset(raw) {
  return raw === "" || raw === "initial"
}

function probeScope(scope) {
  const out = { colors: {}, lengths: {}, raw: {} }
  const probe = document.createElement("div")
  probe.style.position = "absolute"
  scope.appendChild(probe)
  for (const name of COLOR_VARS) {
    const raw = rawVar(scope, name)
    if (isUnset(raw)) {
      out.colors[name] = null
      continue
    }
    probe.style.color = `var(--${name})`
    out.colors[name] = colorEntry(getComputedStyle(probe).color)
  }
  probe.style.color = ""
  for (const name of LENGTH_VARS) {
    const raw = rawVar(scope, name)
    if (isUnset(raw)) {
      out.lengths[name] = null
      continue
    }
    probe.style.width = `var(--${name})`
    out.lengths[name] = parseFloat(getComputedStyle(probe).width)
  }
  for (const name of RAW_VARS) {
    const raw = rawVar(scope, name)
    out.raw[name] = isUnset(raw) ? null : raw
  }
  probe.remove()
  out.events = probeEvents(scope)
  return out
}

function eventElement(scope, accent, attrs) {
  const el = document.createElement("div")
  el.dataset.slot = "calendar-event"
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  // Same inline value event-styles.ts writes.
  el.style.setProperty("--calendar-event-color", `var(--event-color, ${accent})`)
  scope.appendChild(el)
  return el
}
function readVarAsColor(el, name) {
  const child = document.createElement("i")
  child.style.color = `var(--${name})`
  el.appendChild(child)
  const value = getComputedStyle(child).color
  child.remove()
  return colorEntry(value)
}
function cs(el) {
  return getComputedStyle(el)
}

function probeEvents(scope) {
  const events = {}
  for (const accent of EVENT_ACCENTS) {
    const e = {}
    const week = eventElement(scope, accent, { "data-view": "week", "data-kind": "timed" })
    for (const name of [
      "calendar-event-color",
      "calendar-event-boosted-color",
      "calendar-event-tinted-color",
      "calendar-event-tinted-foreground",
      "calendar-event-fill",
      "calendar-event-selected-fill",
      "calendar-event-foreground",
    ]) {
      e[name] = readVarAsColor(week, name)
    }
    e["week.background"] = colorEntry(cs(week).backgroundColor)
    e["week.text"] = colorEntry(cs(week).color)
    week.remove()

    const selected = eventElement(scope, accent, {
      "data-view": "week",
      "data-kind": "timed",
      "data-selected": "",
    })
    e["week.selected.background"] = colorEntry(cs(selected).backgroundColor)
    selected.remove()

    const declined = eventElement(scope, accent, {
      "data-view": "week",
      "data-kind": "timed",
      "data-rsvp": "declined",
    })
    e["declined.text"] = colorEntry(cs(declined).color)
    e["declined.border"] = colorEntry(cs(declined).borderTopColor)
    declined.remove()

    const draft = eventElement(scope, accent, {
      "data-view": "week",
      "data-kind": "timed",
      "data-draft": "true",
    })
    e["draft.background"] = colorEntry(cs(draft).backgroundColor)
    e["draft.text"] = colorEntry(cs(draft).color)
    e["draft.ring"] = colorEntry(cs(draft).boxShadow.match(/^(.*\))\s+0px/)[1])
    draft.remove()

    const selection = document.createElement("div")
    selection.dataset.slot = "week-create-selection"
    selection.style.setProperty("--calendar-event-color", `var(--event-color, ${accent})`)
    scope.appendChild(selection)
    e["create_selection.background"] = colorEntry(cs(selection).backgroundColor)
    selection.remove()

    events[accent] = e
  }
  return events
}

function scopeFor(id, appearance) {
  const scope = document.createElement("div")
  scope.dataset.theme = id
  scope.dataset.appearance = appearance
  document.body.appendChild(scope)
  return scope
}

const { themes, omarchy } = window.RENCAL_FIXTURE_INPUT
const result = { generator: "scripts/fixtures/themes/dump.sh", themes: {} }
for (const { id, appearance } of themes) {
  const scope = scopeFor(id, appearance)
  result.themes[id] = { appearance, ...probeScope(scope) }
  scope.remove()
}
for (const sample of omarchy) {
  const style = document.createElement("style")
  const decls = Object.entries(omarchyVars(sample.colors))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n")
  style.textContent = `[data-theme="omarchy"] {\n${decls}\n}`
  document.head.appendChild(style)
  const scope = scopeFor("omarchy", sample.colors.mode)
  result.themes[`omarchy:${sample.id}`] = {
    appearance: sample.colors.mode,
    omarchy: sample.colors,
    ...probeScope(scope),
  }
  scope.remove()
  style.remove()
}
document.getElementById("out").textContent = JSON.stringify(result)
