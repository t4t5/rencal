import { describe, expect, it } from "vitest"

import {
  BUILTIN_DESCRIPTORS,
  getDeclaredAppearance,
  getThemeFamilies,
  resolveFamilyTheme,
  type ThemeDescriptor,
} from "@/themes/manifest"

describe("getDeclaredAppearance", () => {
  it("resolves built-in and plugin themes from the active registry", () => {
    const plugin: ThemeDescriptor = {
      id: "alice.dusk/dark",
      name: "Dusk Dark",
      appearance: "dark",
      source: "plugin",
    }
    const registry = [...BUILTIN_DESCRIPTORS, plugin]

    expect(getDeclaredAppearance("ren", registry)).toBe("dark")
    expect(getDeclaredAppearance(plugin.id, registry)).toBe("dark")
    expect(getDeclaredAppearance("missing", registry)).toBeNull()
  })

  it("keeps the contract debug palette out of user-facing theme lists", () => {
    expect(BUILTIN_DESCRIPTORS.some((theme) => theme.id === "contract-debug")).toBe(false)
  })
})

describe("theme families", () => {
  it("shows a family's variants as one card in its first variant's place", () => {
    const ids = getThemeFamilies(BUILTIN_DESCRIPTORS).map((family) => family.id)
    expect(ids.slice(0, 3)).toEqual(["omarchy", "ren", "catpuccin-latte"])
    expect(ids).not.toContain("ren-light")
  })

  it("resolves a family's variant by appearance and passes single themes through", () => {
    expect(resolveFamilyTheme("ren", "light")).toBe("ren-light")
    expect(resolveFamilyTheme("ren", "dark")).toBe("ren")
    expect(resolveFamilyTheme("nord", "light")).toBe("nord")
    expect(resolveFamilyTheme("user:mine", "dark")).toBe("user:mine")
  })

  it("pairs variants of the matching appearance", () => {
    for (const family of getThemeFamilies(BUILTIN_DESCRIPTORS)) {
      if (!family.variants) continue
      expect(getDeclaredAppearance(family.variants.light, BUILTIN_DESCRIPTORS)).toBe("light")
      expect(getDeclaredAppearance(family.variants.dark, BUILTIN_DESCRIPTORS)).toBe("dark")
    }
  })
})
