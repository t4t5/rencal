import { describe, expect, it } from "vitest"

import {
  BUILTIN_DESCRIPTORS,
  getActiveAppearance,
  getDeclaredAppearance,
  type ThemeDescriptor,
  themesFor,
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

describe("slots", () => {
  it("lists a slot's themes plus Omarchy, which fits either", () => {
    const light = themesFor("light", BUILTIN_DESCRIPTORS).map((theme) => theme.id)
    const dark = themesFor("dark", BUILTIN_DESCRIPTORS).map((theme) => theme.id)
    expect(light).toContain("ren-light")
    expect(light).not.toContain("ren")
    expect(dark).toContain("ren")
    expect(dark).not.toContain("ren-light")
    expect(light[0]).toBe("omarchy")
    expect(dark[0]).toBe("omarchy")
  })

  it("resolves Omarchy's appearance from its palette mode", () => {
    expect(getActiveAppearance("omarchy", BUILTIN_DESCRIPTORS, "light")).toBe("light")
    expect(getActiveAppearance("omarchy", BUILTIN_DESCRIPTORS, null)).toBeNull()
    expect(getActiveAppearance("nord", BUILTIN_DESCRIPTORS, "light")).toBe("dark")
    expect(getActiveAppearance("missing", BUILTIN_DESCRIPTORS, "light")).toBeNull()
  })
})
