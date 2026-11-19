import { describe, expect, it } from "@/lib/testing/vitest"

import baseline from "@/theme.json"

import builtin from "./builtin.json"
import { parseThemeCss } from "./external"
import { resolveVars, surfacesOf, themeColors, themeFile, type Vars } from "./index"
import { BUILTIN_DESCRIPTORS } from "./manifest"
import { facesOf, typographyDefaults } from "./typography"

const themes = builtin as Record<string, Vars>
const tokens = baseline.cssVars.theme as Vars

const LENGTH_OR_FONT = /^(radius|control-|layout-|month-|event-padding|lane-|font-|text-)/
const colorNames = Object.keys(tokens).filter((name) => !LENGTH_OR_FONT.test(name))

const fileVars = (overrides: Vars, mode: "light" | "dark" = "dark"): Vars =>
  themeFile(overrides, mode).cssVars.theme as Vars

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

  it("takes a theme's type scale over the baseline's", () => {
    const vars = fileVars({ "text-sm": "11px", "text-sm--line-height": "14px" })
    expect(vars["text-sm"]).toBe("11px")
    expect(vars["text-sm--line-height"]).toBe("14px")
    expect(vars["text-xs"]).toBe(tokens["text-xs"])
  })

  it("resolves a font token that points at another", () => {
    const vars = fileVars({ "font-sans": "Pixel, Tahoma", "font-mono": "var(--font-sans)" })
    expect(vars["font-mono"]).toBe("Pixel, Tahoma")
    expect(fileVars({ "font-mono": "var(--font-display)" })["font-mono"]).toBe("sans")
    expect(fileVars({ "font-mono": "var(--font-mono)" })["font-mono"]).toBe("sans")
  })

  it("inverts the toast on light themes", () => {
    expect(fileVars({}, "light").toast).toBe("var(--foreground)")
    expect(fileVars({}, "dark").toast).toBe("var(--popover)")
  })
})

describe("typography", () => {
  it("gives every role and face a baseline value that its default resolves to", () => {
    const resolved = fileVars({})
    for (const name of Object.keys(typographyDefaults())) {
      expect([name, tokens[name]]).toEqual([name, resolved[name]])
    }
  })

  it("sizes roles from a theme's scale, its own role tokens, then Tauri's heading", () => {
    const vars = fileVars({
      "text-sm": "11px",
      "text-sm--line-height": "14px",
      "text-heading": "13px",
      "text-caption": "10px",
    })
    expect(vars["text-body"]).toBe("11px")
    expect(vars["text-body--line-height"]).toBe("14px")
    expect(vars["text-section"]).toBe("11px")
    expect(vars["text-title"]).toBe("13px")
    expect(vars["text-display"]).toBe("13px")
    expect(vars["text-title--line-height"]).toBe(tokens["text-base--line-height"])
    expect(vars["text-caption"]).toBe("10px")
  })

  it("draws faces in the theme's fonts, the mono font unless it sets one", () => {
    expect(fileVars({})["font-heading"]).toBe(tokens["font-mono"])
    const vars = fileVars({ "font-sans": "Pixel, Tahoma", "font-mono": "var(--font-sans)" })
    expect(vars["font-numerical"]).toBe("Pixel, Tahoma")
    expect(fileVars({ "font-button": "system-ui, sans-serif" })["font-button"]).toBe("sans")
  })

  it("leaves no var() in fonts and sizes, which setTheme would reject", () => {
    const vars = fileVars({
      "font-sans": '"Pixelated MS Sans Serif", Tahoma, sans-serif',
      "font-mono": "var(--font-sans)",
      "text-sm": "11px",
      "text-heading": "13px",
      "text-button": "11px",
    })
    const unresolved = Object.entries(vars).filter(
      ([name, value]) => /^(font|text)-/.test(name) && value.includes("var("),
    )
    expect(unresolved).toEqual([])
  })

  it("reads each face's case and weight", () => {
    expect(facesOf({})).toEqual({
      heading: "font-(family-name:--font-heading) uppercase font-normal",
      button: "font-(family-name:--font-button) uppercase font-medium",
      numerical: "font-(family-name:--font-numerical) uppercase font-normal",
    })
    const faces = facesOf({
      "text-heading--transform": "none",
      "text-heading--font-weight": "700",
      "text-button--font-weight": "bold",
    })
    expect(faces.heading).toBe("font-(family-name:--font-heading) normal-case font-bold")
    expect(faces.button).toBe("font-(family-name:--font-button) uppercase font-bold")
  })
})

describe("surfaces", () => {
  it("resolves var() chains and falls back", () => {
    const vars = { a: "var(--b)", b: "#fff" }
    expect(resolveVars("inset 1px 0 var(--a), 0 0 var(--c, red)", vars)).toBe(
      "inset 1px 0 #fff, 0 0 red",
    )
  })

  it("turns a theme's bevels into classes", () => {
    const surfaces = surfacesOf(
      {
        light: "#fff",
        raised: "inset 1px 1px 0 var(--light), inset -1px -1px 0 #000",
        "button-shadow": "var(--raised)",
        "button-shadow-active": "inset 1px 1px 0 #000",
        control: "#ffffff",
        "control-shadow": "none",
      },
      "light",
    )
    expect(surfaces.button).toBe(
      "shadow-[inset_1px_1px_0_#fff,inset_-1px_-1px_0_#000] active:shadow-[inset_1px_1px_0_#000]",
    )
    expect(surfaces.control).toBe("bg-[#ffffff]")
  })

  it("keeps them out of the theme file, which NSH would reject", async () => {
    const overrides = {
      raised: "inset 1px 1px 0 #fff",
      "button-shadow": "var(--raised)",
      "button-shadow-active": "var(--raised)",
      control: "var(--background)",
      "control-shadow": "var(--raised)",
    }
    const vars = fileVars(overrides, "light")
    expect(
      ["button-shadow", "button-shadow-active", "control", "control-shadow"].filter(
        (name) => name in vars,
      ),
    ).toEqual([])
    await themeColors(overrides, "light")
  })

  it("leaves the kit's look to themes without them", () => {
    expect(surfacesOf({}, "dark")).toEqual({ button: "", control: "" })
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
