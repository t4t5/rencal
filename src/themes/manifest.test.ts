import { describe, expect, it } from "vitest"

import { BUILTIN_DESCRIPTORS, resolveAppearance, type ThemeDescriptor } from "@/themes/manifest"

const themeFiles = Object.keys(import.meta.glob("./*.css")).map((file) => file.slice(2))

describe("resolveAppearance", () => {
  const plugin: ThemeDescriptor = {
    id: "alice.dusk/dark",
    name: "Dusk Dark",
    appearance: "dark",
    source: "plugin",
  }
  const both: ThemeDescriptor = {
    id: "alice.gruvbox/gruvbox",
    name: "Gruvbox",
    appearance: "both",
    source: "plugin",
  }
  const registry = [...BUILTIN_DESCRIPTORS, plugin, both]

  it("keeps a fixed appearance whatever the preference or system", () => {
    for (const preference of ["auto", "light", "dark"] as const) {
      expect(resolveAppearance("ren", registry, { preference, system: "light" })).toBe("dark")
      expect(resolveAppearance(plugin.id, registry, { preference, system: "light" })).toBe("dark")
      expect(resolveAppearance("minimal", registry, { preference, system: "dark" })).toBe("light")
    }
  })

  it("follows the system on auto and the pin otherwise for themes with both variants", () => {
    expect(resolveAppearance(both.id, registry, { preference: "auto", system: "light" })).toBe(
      "light",
    )
    expect(resolveAppearance(both.id, registry, { preference: "auto", system: "dark" })).toBe(
      "dark",
    )
    expect(resolveAppearance(both.id, registry, { preference: "light", system: "dark" })).toBe(
      "light",
    )
    expect(resolveAppearance(both.id, registry, { preference: "dark", system: "light" })).toBe(
      "dark",
    )
  })

  it("leaves runtime and unknown themes to be derived", () => {
    const options = { preference: "light", system: "light" } as const
    expect(resolveAppearance("omarchy", registry, options)).toBeNull()
    expect(resolveAppearance("missing", registry, options)).toBeNull()
  })
})

describe("built-in themes", () => {
  it("keeps the contract debug palette out of user-facing theme lists", () => {
    expect(BUILTIN_DESCRIPTORS.some((theme) => theme.id === "contract-debug")).toBe(false)
  })

  it("has the CSS files each manifest entry needs", () => {
    for (const theme of BUILTIN_DESCRIPTORS) {
      const expected =
        theme.appearance === "both"
          ? [`${theme.id}.light.css`, `${theme.id}.dark.css`]
          : [`${theme.id}.css`]
      for (const file of expected) expect(themeFiles, theme.id).toContain(file)
    }
  })
})
