// The theme tokens the builder edits, grouped after the app's theme contract
// (src/themes/README.md). `fallback` is the value the app uses when a theme
// leaves the token unset; keep it in sync with the app's src/global.css.
export type TokenControl =
  | { kind: "color" }
  | { kind: "range"; min: number; max: number; unit: "px" | "%" }
  | { kind: "choice"; options: { label: string; value: string }[] }

export interface Token {
  name: string
  label: string
  control: TokenControl
  fallback?: string
  /** Shown instead of the token name while the token is unset. */
  note?: string
}

export interface TokenGroup {
  tab: "colors" | "style"
  title: string
  tokens: Token[]
}

const color: TokenControl = { kind: "color" }
const tintSteps = (steps: number) => ({
  fallback: `color-mix(in srgb, var(--surface-tint) calc(var(--surface-tint-step) * ${steps}), transparent)`,
  note: `Derived · ${steps} tint step${steps === 1 ? "" : "s"}`,
})
const font = (fallback: "sans" | "mono"): Pick<Token, "control" | "fallback"> => ({
  control: {
    kind: "choice",
    options: [
      { label: "Sans", value: "var(--font-sans)" },
      { label: "Mono", value: "var(--font-mono)" },
    ],
  },
  fallback: `var(--font-${fallback})`,
})
const textCase: Pick<Token, "control" | "fallback"> = {
  control: {
    kind: "choice",
    options: [
      { label: "Caps", value: "uppercase" },
      { label: "Normal", value: "none" },
    ],
  },
  fallback: "uppercase",
}

export const TOKEN_GROUPS: TokenGroup[] = [
  {
    tab: "colors",
    title: "Base",
    tokens: [
      { name: "--background", label: "Background", control: color, fallback: "#131313" },
      { name: "--foreground", label: "Text", control: color, fallback: "white" },
      {
        name: "--muted-foreground",
        label: "Muted text",
        control: color,
        fallback: "color-mix(in srgb, var(--foreground) 50%, transparent)",
        note: "Derived · 50% text",
      },
      {
        name: "--placeholder-foreground",
        label: "Placeholder text",
        control: color,
        fallback: "var(--muted-foreground)",
      },
      { name: "--sidebar", label: "Sidebar", control: color, fallback: "var(--background)" },
    ],
  },
  {
    tab: "colors",
    title: "Accents",
    tokens: [
      { name: "--primary", label: "Primary", control: color, fallback: "#f56313" },
      {
        name: "--primary-foreground",
        label: "Text on primary",
        control: color,
        fallback: "var(--background)",
      },
      { name: "--today", label: "Today", control: color, fallback: "var(--primary)" },
      {
        name: "--today-foreground",
        label: "Text on today",
        control: color,
        fallback: "var(--primary-foreground)",
      },
      { name: "--brand", label: "Brand", control: color, fallback: "var(--primary)" },
      {
        name: "--brand-foreground",
        label: "Text on brand",
        control: color,
        fallback: "var(--background)",
      },
    ],
  },
  {
    tab: "colors",
    title: "Surfaces",
    tokens: [
      {
        name: "--surface-tint",
        label: "Surface tint",
        control: color,
        fallback: "var(--foreground)",
      },
      {
        name: "--surface-tint-step",
        label: "Tint step",
        control: { kind: "range", min: 0, max: 25, unit: "%" },
        fallback: "5%",
      },
      { name: "--hover", label: "Hover", control: color, ...tintSteps(1) },
      { name: "--secondary", label: "Secondary", control: color, ...tintSteps(1) },
      { name: "--weekend", label: "Weekend", control: color, fallback: "var(--hover)" },
      { name: "--accent", label: "Accent", control: color, ...tintSteps(3) },
      { name: "--border", label: "Border", control: color, ...tintSteps(3) },
      { name: "--selected", label: "Selected", control: color, ...tintSteps(4) },
      {
        name: "--selected-foreground",
        label: "Text on selected",
        control: color,
        fallback: "var(--foreground)",
      },
      { name: "--input", label: "Input", control: color, ...tintSteps(4) },
      {
        name: "--card",
        label: "Card",
        control: color,
        fallback:
          "color-mix(in srgb, var(--surface-tint) var(--surface-tint-step), var(--background))",
        note: "Derived · 1 tint step over background",
      },
      { name: "--popover", label: "Popover", control: color, fallback: "var(--card)" },
    ],
  },
  {
    tab: "colors",
    title: "Events",
    tokens: [
      {
        name: "--event-color",
        label: "Event color",
        control: color,
        note: "Unset · per-calendar colors",
      },
      {
        name: "--event-background",
        label: "Event fill",
        control: color,
        note: "Unset · tinted from event color",
      },
      {
        name: "--event-foreground",
        label: "Event text",
        control: color,
        note: "Unset · tinted from event color",
      },
      {
        name: "--event-tint-surface",
        label: "Event tint surface",
        control: color,
        fallback: "var(--background)",
      },
    ],
  },
  {
    tab: "colors",
    title: "Status",
    tokens: [
      { name: "--success", label: "Success", control: color, fallback: "#4caf50" },
      { name: "--warning", label: "Warning", control: color, fallback: "#fd8742" },
      { name: "--destructive", label: "Destructive", control: color, fallback: "#e25252" },
    ],
  },
  {
    tab: "style",
    title: "Fonts",
    tokens: [
      { name: "--font-body", label: "Body", ...font("sans") },
      { name: "--font-heading", label: "Headings", ...font("mono") },
      { name: "--font-button", label: "Buttons", ...font("mono") },
      { name: "--font-numerical", label: "Numbers", ...font("mono") },
    ],
  },
  {
    tab: "style",
    title: "Letter case",
    tokens: [
      { name: "--text-heading--transform", label: "Headings", ...textCase },
      { name: "--text-button--transform", label: "Buttons", ...textCase },
      { name: "--text-numerical--transform", label: "Numbers", ...textCase },
    ],
  },
  {
    tab: "style",
    title: "Shape",
    tokens: [
      {
        name: "--radius",
        label: "Radius",
        control: { kind: "range", min: 0, max: 16, unit: "px" },
        fallback: "0px",
      },
      {
        name: "--radius-circle",
        label: "Circles",
        control: {
          kind: "choice",
          options: [
            { label: "Square", value: "0px" },
            { label: "Round", value: "calc(infinity * 1px)" },
          ],
        },
        fallback: "calc(var(--radius) * 1000)",
        note: "Follows radius",
      },
      {
        name: "--button-border",
        label: "Button border",
        control: color,
        fallback: "transparent",
      },
    ],
  },
  {
    tab: "style",
    title: "Density",
    tokens: [
      {
        name: "--control-height",
        label: "Control height",
        control: { kind: "range", min: 24, max: 44, unit: "px" },
        fallback: "34px",
      },
      {
        name: "--layout-padding",
        label: "Layout padding",
        control: { kind: "range", min: 4, max: 24, unit: "px" },
        fallback: "12px",
      },
    ],
  },
]
