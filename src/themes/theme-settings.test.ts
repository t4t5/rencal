import { describe, expect, it } from "vitest"

import type { ThemeSettings } from "@/lib/api"

import { BUILTIN_DESCRIPTORS, omarchyDescriptor } from "@/themes/manifest"
import { cycleTheme, forcedTheme, pickTheme, themesFor } from "@/themes/theme-settings"

const settings: ThemeSettings = { mode: "system", single: "nord", light: "ren-light", dark: "ren" }

// The registry on an Omarchy desktop.
const withOmarchy = [omarchyDescriptor("light"), ...BUILTIN_DESCRIPTORS]

const ids = (slot: Parameters<typeof themesFor>[0]) =>
  themesFor(slot, BUILTIN_DESCRIPTORS).map((theme) => theme.id)

describe("forcedTheme", () => {
  it("follows the OS while syncing, except on Omarchy, and forces the single theme", () => {
    expect(forcedTheme(settings, false)).toBeNull()
    expect(forcedTheme(settings, true)).toBe("omarchy")
    const single = { ...settings, mode: "single" } as const
    expect(forcedTheme(single, false)).toBe("nord")
    expect(forcedTheme(single, true)).toBe("nord")
  })
})

describe("themesFor", () => {
  it("offers a pair slot its appearance's themes, single every theme, and no slot Omarchy", () => {
    expect(ids("light")).toContain("ren-light")
    expect(ids("light")).not.toContain("ren")
    expect(ids("dark")).toContain("ren")
    expect(ids("dark")).not.toContain("ren-light")
    for (const slot of ["single", "light", "dark"] as const) {
      expect(themesFor(slot, withOmarchy).map((theme) => theme.id)).not.toContain("omarchy")
    }
    expect(ids("single")).toEqual(BUILTIN_DESCRIPTORS.map((theme) => theme.id))
  })
})

describe("pickTheme", () => {
  it("shows a theme as the single theme, and Omarchy by syncing", () => {
    expect(pickTheme(settings, "minimal")).toEqual({
      ...settings,
      mode: "single",
      single: "minimal",
    })
    const single = { ...settings, mode: "single" } as const
    expect(pickTheme(single, "omarchy")).toEqual(settings)
  })
})

describe("cycleTheme", () => {
  it("cycles the showing pair slot and leaves the rest alone", () => {
    const light = ids("light")
    let next = settings
    const seen: string[] = []
    for (let i = 0; i < light.length; i++) {
      next = cycleTheme(next, BUILTIN_DESCRIPTORS, false, "light")
      seen.push(next.light)
      expect(next).toMatchObject({ mode: "system", single: "nord", dark: "ren" })
    }
    expect(seen.sort()).toEqual([...light].sort())
  })

  it("cycles every theme in single mode", () => {
    const single = { ...settings, mode: "single" } as const
    const all = ids("single")
    expect(cycleTheme(single, BUILTIN_DESCRIPTORS, false, "dark").single).toBe(
      all[(all.indexOf("nord") + 1) % all.length],
    )
  })

  it("cycles from Omarchy to a single theme and back to syncing", () => {
    const afterOmarchy = cycleTheme(settings, withOmarchy, true, "dark")
    expect(afterOmarchy).toEqual({ ...settings, mode: "single", single: "ren" })
    const last = { ...settings, mode: "single", single: "minimal" } as const
    expect(cycleTheme(last, withOmarchy, true, "dark")).toEqual({ ...last, mode: "system" })
  })

  it("starts the slot's list over from an unlisted theme", () => {
    expect(
      cycleTheme({ ...settings, dark: "user:gone" }, BUILTIN_DESCRIPTORS, false, "dark").dark,
    ).toBe(ids("dark")[0])
  })
})
