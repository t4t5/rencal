import { describe, expect, it } from "vitest"

import { BUILTIN_DESCRIPTORS, resolveAppearance, type ThemeDescriptor } from "@/themes/manifest"

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

  it("keeps a fixed appearance whatever the system", () => {
    expect(resolveAppearance("ren", registry, "light")).toBe("dark")
    expect(resolveAppearance(plugin.id, registry, "light")).toBe("dark")
    expect(resolveAppearance("minimal", registry, "dark")).toBe("light")
  })

  it("follows the system for themes with both variants", () => {
    expect(resolveAppearance(both.id, registry, "light")).toBe("light")
    expect(resolveAppearance(both.id, registry, "dark")).toBe("dark")
  })

  it("leaves runtime and unknown themes to be derived", () => {
    expect(resolveAppearance("omarchy", registry, "light")).toBeNull()
    expect(resolveAppearance("missing", registry, "light")).toBeNull()
  })
})

describe("built-in themes", () => {
  it("keeps the contract debug palette out of user-facing theme lists", () => {
    expect(BUILTIN_DESCRIPTORS.some((theme) => theme.id === "contract-debug")).toBe(false)
  })
})
