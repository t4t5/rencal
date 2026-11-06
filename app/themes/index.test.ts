import { describe, expect, it } from "@/lib/testing/vitest"

import baseline from "@/theme.json"

import builtin from "./builtin.json"
import { parseThemeCss } from "./external"
import { themeColors, themeFile, type Vars } from "./index"
import { BUILTIN_DESCRIPTORS } from "./manifest"

const themes = builtin as Record<string, Vars>
const tokens = baseline.cssVars.theme as Vars

const LENGTH_OR_FONT = /^(radius|control-|layout-|month-|event-padding|lane-|font-)/
const colorNames = Object.keys(tokens).filter((name) => !LENGTH_OR_FONT.test(name))

const fileVars = (overrides: Vars, mode: "light" | "dark" = "dark"): Vars =>
  (JSON.parse(themeFile(overrides, mode)) as { cssVars: { theme: Vars } }).cssVars.theme

describe("themeFile", () => {
  it("scales the baseline's surfaces by the theme's step, and leaves a theme's own alone", () => {
    const vars = fileVars({
      "surface-tint-step": "10%",
      selected: "color-mix(in srgb, var(--surface-tint) 18%, transparent)",
    })
    expect(vars.hover).toBe("color-mix(in srgb, var(--surface-tint) 10%, transparent)")
    expect(vars.accent).toBe("color-mix(in srgb, var(--surface-tint) 30%, transparent)")
    expect(vars.selected).toBe("color-mix(in srgb, var(--surface-tint) 18%, transparent)")
    expect(vars["primary-hover"]).toBe("color-mix(in srgb, white 10%, var(--primary))")
    expect(vars.tooltip).toBe(tokens.tooltip)
    expect(vars["surface-tint-step"]).toBeUndefined()
  })

  it("derives the radius scale from --radius, keeping what a theme sets", () => {
    const vars = fileVars({ radius: "10px", "radius-circle": "4px" })
    expect(vars["radius-md"]).toBe("8px")
    expect(vars["radius-lg"]).toBe("10px")
    expect(vars["radius-circle"]).toBe("4px")
    expect(fileVars({ radius: "0.5rem" })["radius-lg"]).toBe("8px")
    expect(fileVars({})["radius-md"]).toBe("0px")
  })

  it("derives control heights from --control-height", () => {
    expect(fileVars({ "control-height": "40px" })["control-height-xs"]).toBe("30px")
  })

  it("draws what was --font-heading with the mono token", () => {
    expect(fileVars({ "font-heading": "var(--font-sans)" })["font-mono"]).toBe("sans")
    expect(fileVars({ "font-button": "var(--font-mono)" })["font-mono"]).toBe(tokens["font-mono"])
    expect(fileVars({ "font-heading": "Tahoma, sans-serif" })["font-mono"]).toBe(
      "Tahoma, sans-serif",
    )
  })

  it("inverts the toast on light themes", () => {
    expect(fileVars({}, "light").toast).toBe("var(--foreground)")
    expect(fileVars({}, "dark").toast).toBe("var(--popover)")
  })
})

describe("built-in themes", () => {
  for (const { id, appearance } of BUILTIN_DESCRIPTORS) {
    it(`${id} resolves every color token`, async () => {
      const colors = await themeColors(themes[id] ?? {}, appearance)
      const unresolved = colorNames.filter((name) => !/^#[0-9a-f]{8}$/.test(colors[name] ?? ""))
      expect(unresolved).toEqual([])
    })

    it(`${id} resolves each color it adds`, async () => {
      const colors = await themeColors(themes[id] ?? {}, appearance)
      const added = Object.entries(themes[id] ?? {}).filter(
        ([name, value]) => !(name in tokens) && /#|var\(|color-mix|^white$/.test(value),
      )
      const undrawn = /^(font-|text-|surface-tint-step)/
      expect(
        added.filter(([name]) => !undrawn.test(name) && !colors[name]).map(([name]) => name),
      ).toEqual([])
    })
  }

  it("mixes surfaces as CSS does", async () => {
    const colors = await themeColors(themes.ren ?? {}, "dark")
    expect(colors.background).toBe("#131313ff")
    expect(colors.hover).toBe("#ffffff0d")
    expect(colors.card).toBe("#1f1f1fff")
    expect(colors.overlay).toBe("#00000080")
    expect(colors["primary-hover"]).toBe("#f66b1fff")
  })
})

describe("parseThemeCss", () => {
  it("takes custom properties, and counts the rules it has to drop", () => {
    const { vars, selectors } = parseThemeCss(`
      /* @name Theme { not a rule } */
      --background: #282a36;
      --shadow:
        0 0 0 1px red,
        0 1px 2px black;
      color: red;

      [data-slot="tabs-list"] {
        gap: 6px;
        & > a { --nested: 1px; }
      }
      --radius: 4px
    `)
    expect(vars).toEqual({
      background: "#282a36",
      shadow: "0 0 0 1px red, 0 1px 2px black",
      radius: "4px",
    })
    expect(selectors).toBe(1)
  })
})
