// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ExternalTheme } from "@/lib/api"

import {
  applyExternalThemes,
  externalThemeDescriptor,
  externalThemePalette,
} from "@/themes/external"

const loose: ExternalTheme = {
  id: "user:local",
  name: "Local",
  css: "--background: white;",
  source: { kind: "loose" },
  appearance: null,
}

const plugin: ExternalTheme = {
  id: "alice.dusk/dark",
  name: "Dusk Dark",
  css: "--background: black;",
  source: { kind: "plugin", id: "alice.dusk" },
  appearance: "dark",
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
  delete document.body.dataset.theme
  document.head
    .querySelectorAll("style[data-external-theme]")
    .forEach((element) => element.remove())
})

describe("external themes", () => {
  it("maps plugin source and declared appearance onto its descriptor", () => {
    expect(externalThemeDescriptor(plugin)).toEqual({
      id: "alice.dusk/dark",
      name: "Dusk Dark",
      appearance: "dark",
      source: "plugin",
    })
  })

  it("infers a loose theme's appearance from its background", () => {
    // happy-dom has no canvas; resolve the colours used here.
    const colors: Record<string, number[]> = {
      white: [255, 255, 255, 255],
      "#111": [17, 17, 17, 255],
    }
    const ctx = {
      fillStyle: "",
      clearRect: () => {},
      fillRect: () => {},
      // Anything else is unparseable and paints nothing.
      getImageData: () => ({ data: colors[ctx.fillStyle] ?? [0, 0, 0, 0] }),
    }
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    )

    expect(externalThemeDescriptor(loose).appearance).toBe("light")
    expect(externalThemeDescriptor({ ...loose, css: "--background: #111;" }).appearance).toBe(
      "dark",
    )
    expect(
      externalThemeDescriptor({ ...loose, css: "--background: var(--paper); --paper: white;" })
        .appearance,
    ).toBe("light")
    expect(externalThemeDescriptor({ ...loose, css: "--background: nope;" }).appearance).toBe(
      "dark",
    )
    expect(externalThemeDescriptor({ ...loose, css: "--primary: red;" }).appearance).toBe("dark")
  })

  it("updates styles and removes themes missing from the next snapshot", () => {
    applyExternalThemes([loose, plugin], loose.id)
    expect(document.head.querySelectorAll("style[data-external-theme]")).toHaveLength(1)

    applyExternalThemes([loose, plugin], plugin.id)
    applyExternalThemes([{ ...plugin, css: "--background: navy;" }], plugin.id)

    expect(document.head.querySelector('style[data-external-theme="user:local"]')).toBeNull()
    expect(
      document.head.querySelector('style[data-external-theme="alice.dusk/dark"]')?.textContent,
    ).toContain("--background: navy;")

    applyExternalThemes([], plugin.id)
    expect(document.head.querySelectorAll("style[data-external-theme]")).toHaveLength(0)
  })

  it.each([loose, plugin])("loads escaped rules only while $id is selected", (theme) => {
    const malicious = { ...theme, css: "} button { display:none!important } /*" }
    const button = document.createElement("button")
    document.body.append(button)
    document.body.dataset.theme = "ren"
    const originalDisplay = getComputedStyle(button).display

    applyExternalThemes([malicious], "ren")
    expect(getComputedStyle(button).display).toBe(originalDisplay)
    expect(document.head.querySelectorAll("style[data-external-theme]")).toHaveLength(0)

    document.body.dataset.theme = theme.id
    applyExternalThemes([malicious], theme.id)
    expect(getComputedStyle(button).display).toBe("none")

    document.body.dataset.theme = "ren"
    applyExternalThemes([malicious], "ren")
    expect(getComputedStyle(button).display).toBe(originalDisplay)
    expect(document.head.querySelectorAll("style[data-external-theme]")).toHaveLength(0)
  })

  it("previews custom properties without loading declarations or escaped selectors", () => {
    const preview = document.createElement("div")
    const button = document.createElement("button")
    document.body.append(preview, button)
    const originalDisplay = getComputedStyle(button).display
    const palette = externalThemePalette(
      "--background: navy; --primary: var(--accent); --accent: red; display: none; } button { display:none!important } /*",
    )
    for (const [name, value] of Object.entries(palette)) preview.style.setProperty(name, value)

    expect(palette).toEqual({
      "--background": "navy",
      "--primary": "var(--accent)",
      "--accent": "red",
    })
    expect(preview.style.display).toBe("")
    expect(getComputedStyle(button).display).toBe(originalDisplay)
    expect(document.body.style.getPropertyValue("--background")).toBe("")
  })

  it("preserves a token-only compact theme for previews", () => {
    const compact = [
      "--control-height: 24px;",
      "--control-height-sm: 24px;",
      "--control-height-lg: 28px;",
      "--text-base: 14px;",
      "--text-base--line-height: 20px;",
      "--text-xs: 11px;",
      "--text-xs--line-height: 14px;",
      "--radius: 2px;",
    ].join(" ")

    expect(externalThemePalette(compact)).toEqual({
      "--control-height": "24px",
      "--control-height-sm": "24px",
      "--control-height-lg": "28px",
      "--text-base": "14px",
      "--text-base--line-height": "20px",
      "--text-xs": "11px",
      "--text-xs--line-height": "14px",
      "--radius": "2px",
    })
  })
})
