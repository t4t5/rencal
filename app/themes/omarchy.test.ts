import type { OmarchyColors } from "@/lib/api"
import { describe, expect, it } from "@/lib/testing/vitest"

import { omarchyVars } from "./omarchy"

const dark: OmarchyColors = {
  mode: "dark",
  name: "tokyo-night",
  background: "#1a1b26",
  foreground: "#a9b1d6",
  bright_foreground: "#c0caf5",
  accent: "#7aa2f7",
  red: "#f7768e",
  green: "#9ece6a",
  yellow: "#e0af68",
  blue: "#7dcfff",
}

describe("omarchyVars", () => {
  it("takes the foreground that contrasts the background more", () => {
    expect(omarchyVars(dark).foreground).toBe("#c0caf5")
    expect(omarchyVars({ ...dark, bright_foreground: "#2a2b36" }).foreground).toBe("#a9b1d6")
  })

  it("picks readable text for each fill", () => {
    expect(omarchyVars(dark)["primary-foreground"]).toBe("#1a1b26")
  })

  it("paints monochrome themes in the accent, events included", () => {
    const vars = omarchyVars({ ...dark, name: "vantablack" })
    expect(vars.today).toBe("#7aa2f7")
    expect(vars["event-background"]).toBe("#7aa2f7")
    expect(omarchyVars(dark)["event-background"]).toBeUndefined()
  })
})
