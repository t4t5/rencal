import { describe, expect, it } from "vitest"

import type { ThemeSettings } from "@/lib/api"

import { BUILTIN_DESCRIPTORS, getDeclaredAppearance, themesFor } from "@/themes/manifest"
import { cycleTheme, pickTheme, resolveTheme } from "@/themes/theme-settings"

const pair: ThemeSettings = { mode: "system", light: "ren-light", dark: "ren" }
const same: ThemeSettings = { mode: "system", light: "nord", dark: "nord" }

const pick = (settings: ThemeSettings, id: string, os: "light" | "dark") =>
  pickTheme(settings, id, getDeclaredAppearance(id, BUILTIN_DESCRIPTORS), os)

describe("resolveTheme", () => {
  it("follows the OS in System mode with different slots", () => {
    expect(resolveTheme(pair, "light")).toEqual({
      activeSlot: "light",
      activeTheme: "ren-light",
      followsSystem: true,
    })
    expect(resolveTheme(pair, "dark")).toEqual({
      activeSlot: "dark",
      activeTheme: "ren",
      followsSystem: true,
    })
  })

  it("doesn't follow the OS when both slots hold the same theme", () => {
    expect(resolveTheme(same, "light")).toMatchObject({ activeTheme: "nord", followsSystem: false })
  })

  it("pins the slot in Light or Dark mode", () => {
    expect(resolveTheme({ ...pair, mode: "dark" }, "light")).toEqual({
      activeSlot: "dark",
      activeTheme: "ren",
      followsSystem: false,
    })
  })
})

describe("pickTheme", () => {
  it("fills the theme's slot and keeps a pinned mode showing it", () => {
    expect(pick({ ...pair, mode: "dark" }, "nord", "light")).toEqual({
      mode: "dark",
      light: "ren-light",
      dark: "nord",
    })
  })

  it("switches a pinned mode to the theme's appearance", () => {
    expect(pick({ ...pair, mode: "dark" }, "minimal", "dark")).toEqual({
      mode: "light",
      light: "minimal",
      dark: "ren",
    })
  })

  it("keeps System when the OS already shows the theme's slot", () => {
    expect(pick(pair, "nord", "dark")).toEqual({ ...pair, dark: "nord" })
  })

  it("pins the mode in System when the OS is on the other side", () => {
    expect(pick(pair, "nord", "light")).toEqual({ mode: "dark", light: "ren-light", dark: "nord" })
  })

  it("fills both slots with Omarchy", () => {
    expect(pick({ ...pair, mode: "light" }, "omarchy", "dark")).toEqual({
      mode: "light",
      light: "omarchy",
      dark: "omarchy",
    })
  })

  it("fills the active slot with an unknown theme", () => {
    expect(pick(pair, "user:mine", "light")).toEqual({ ...pair, light: "user:mine" })
  })
})

describe("cycleTheme", () => {
  it("stays within the active slot's themes", () => {
    const light = themesFor("light", BUILTIN_DESCRIPTORS).map((theme) => theme.id)
    let settings: ThemeSettings = { ...pair, mode: "light" }
    const seen: string[] = []
    for (let i = 0; i < light.length; i++) {
      settings = cycleTheme(settings, BUILTIN_DESCRIPTORS, "dark")
      seen.push(settings.light)
      expect(settings.dark).toBe("ren")
      expect(settings.mode).toBe("light")
    }
    expect(seen.sort()).toEqual([...light].sort())
  })

  it("starts the slot's list over from an unlisted theme", () => {
    const first = themesFor("dark", BUILTIN_DESCRIPTORS)[0]?.id
    expect(cycleTheme({ ...pair, dark: "user:gone" }, BUILTIN_DESCRIPTORS, "dark").dark).toBe(first)
  })
})
