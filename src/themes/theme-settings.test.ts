import { describe, expect, it } from "vitest"

import type { ThemeSettings } from "@/lib/api"

import { BUILTIN_DESCRIPTORS } from "@/themes/manifest"
import { activeSlot, cycleTheme, resolveSync, themesFor } from "@/themes/theme-settings"

const settings: ThemeSettings = { mode: "system", single: "nord", light: "ren-light", dark: "ren" }

const ids = (slot: Parameters<typeof themesFor>[0]) =>
  themesFor(slot, BUILTIN_DESCRIPTORS).map((theme) => theme.id)

describe("activeSlot", () => {
  it("follows the OS while syncing and shows the single theme otherwise", () => {
    expect(activeSlot(settings, "light")).toBe("light")
    expect(activeSlot(settings, "dark")).toBe("dark")
    expect(activeSlot({ ...settings, mode: "single" }, "light")).toBe("single")
  })
})

describe("resolveSync", () => {
  it("shows Omarchy while syncing on Omarchy and leaves other settings alone", () => {
    expect(resolveSync(settings, true)).toEqual({ ...settings, mode: "single", single: "omarchy" })
    expect(resolveSync(settings, false)).toBe(settings)
    const single = { ...settings, mode: "single" } as const
    expect(resolveSync(single, true)).toBe(single)
  })
})

describe("themesFor", () => {
  it("offers a pair slot its appearance's and adaptive themes, and single every theme", () => {
    expect(ids("light")).toContain("ren-light")
    expect(ids("light")).not.toContain("ren")
    expect(ids("dark")).toContain("ren")
    expect(ids("dark")).not.toContain("ren-light")
    expect(ids("light")).toContain("omarchy")
    expect(ids("dark")).toContain("omarchy")
    expect(ids("single")).toEqual(BUILTIN_DESCRIPTORS.map((theme) => theme.id))
  })
})

describe("cycleTheme", () => {
  it("cycles the showing pair slot and leaves the rest alone", () => {
    const light = ids("light")
    let next = settings
    const seen: string[] = []
    for (let i = 0; i < light.length; i++) {
      next = cycleTheme(next, BUILTIN_DESCRIPTORS, "light")
      seen.push(next.light)
      expect(next).toMatchObject({ mode: "system", single: "nord", dark: "ren" })
    }
    expect(seen.sort()).toEqual([...light].sort())
  })

  it("cycles every theme in single mode", () => {
    const single = { ...settings, mode: "single" } as const
    const all = ids("single")
    expect(cycleTheme(single, BUILTIN_DESCRIPTORS, "dark").single).toBe(
      all[(all.indexOf("nord") + 1) % all.length],
    )
  })

  it("starts the slot's list over from an unlisted theme", () => {
    expect(cycleTheme({ ...settings, dark: "user:gone" }, BUILTIN_DESCRIPTORS, "dark").dark).toBe(
      ids("dark")[0],
    )
  })
})
