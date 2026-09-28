import { describe, expect, it } from "vitest"

import {
  BUILTIN_DESCRIPTORS,
  DEFAULT_SYSTEM_THEMES,
  getDeclaredAppearance,
  resolveThemeSetting,
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

describe("resolveThemeSetting", () => {
  it("shows a single theme regardless of the system and a pair's matching half", () => {
    expect(resolveThemeSetting("nord", "light")).toBe("nord")
    expect(resolveThemeSetting(DEFAULT_SYSTEM_THEMES, "light")).toBe("ren-light")
    expect(resolveThemeSetting(DEFAULT_SYSTEM_THEMES, "dark")).toBe("ren")
  })

  it("pairs built-in themes of the matching appearance by default", () => {
    expect(getDeclaredAppearance(DEFAULT_SYSTEM_THEMES.light, BUILTIN_DESCRIPTORS)).toBe("light")
    expect(getDeclaredAppearance(DEFAULT_SYSTEM_THEMES.dark, BUILTIN_DESCRIPTORS)).toBe("dark")
  })
})
