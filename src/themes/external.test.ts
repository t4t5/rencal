// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"

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
  source: { kind: "plugin", id: "alice.dusk", version: "1.0.0" },
  appearance: "dark",
}

afterEach(() => {
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
    expect(externalThemeDescriptor(loose).appearance).toBeNull()
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
})
