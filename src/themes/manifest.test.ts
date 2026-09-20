import { describe, expect, it } from "vitest"

import { BUILTIN_DESCRIPTORS, getDeclaredAppearance, type ThemeDescriptor } from "@/themes/manifest"

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
})
