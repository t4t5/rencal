// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"

import type { ExternalTheme } from "@/lib/api"

import {
  applyExternalThemes,
  externalThemeCss,
  externalThemeDescriptor,
  externalThemePalette,
} from "@/themes/external"

const loose: ExternalTheme = {
  id: "user:local",
  name: "Local",
  variants: { kind: "single", css: "--background: white;", appearance: null },
  source: { kind: "loose" },
}

const plugin: ExternalTheme = {
  id: "alice.dusk/dark",
  name: "Dusk Dark",
  variants: { kind: "single", css: "--background: black;", appearance: "dark" },
  source: { kind: "plugin", id: "alice.dusk" },
}

const both: ExternalTheme = {
  id: "alice.gruvbox/gruvbox",
  name: "Gruvbox",
  variants: { kind: "both", light: "--background: #fbf1c7;", dark: "--background: #282828;" },
  source: { kind: "plugin", id: "alice.gruvbox" },
}

function withCss(theme: ExternalTheme, css: string): ExternalTheme {
  return { ...theme, variants: { kind: "single", css, appearance: null } }
}

afterEach(() => {
  document.body.replaceChildren()
  delete document.body.dataset.theme
  delete document.body.dataset.appearance
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
    expect(externalThemeDescriptor(both).appearance).toBe("both")
  })

  it("writes one rule per variant for a theme with both", () => {
    applyExternalThemes([both], both.id)
    const rules = document.head.querySelector(
      'style[data-external-theme="alice.gruvbox/gruvbox"]',
    )?.textContent

    expect(rules).toBe(
      [
        '[data-theme="alice\\.gruvbox\\/gruvbox"][data-appearance="light"] {\n--background: #fbf1c7;\n}',
        '[data-theme="alice\\.gruvbox\\/gruvbox"][data-appearance="dark"] {\n--background: #282828;\n}',
      ].join("\n\n"),
    )
  })

  it("applies the variant matching the body appearance", () => {
    document.body.dataset.theme = both.id
    document.body.dataset.appearance = "light"
    applyExternalThemes([both], both.id)
    expect(getComputedStyle(document.body).getPropertyValue("--background").trim()).toBe("#fbf1c7")

    document.body.dataset.appearance = "dark"
    expect(getComputedStyle(document.body).getPropertyValue("--background").trim()).toBe("#282828")
  })

  it("picks per-variant CSS for previews", () => {
    expect(externalThemeCss(both, "light")).toBe("--background: #fbf1c7;")
    expect(externalThemeCss(both, "dark")).toBe("--background: #282828;")
    expect(externalThemeCss(plugin, "light")).toBe("--background: black;")
  })

  it("updates styles and removes themes missing from the next snapshot", () => {
    applyExternalThemes([loose, plugin], loose.id)
    expect(document.head.querySelectorAll("style[data-external-theme]")).toHaveLength(1)

    applyExternalThemes([loose, plugin], plugin.id)
    applyExternalThemes([withCss(plugin, "--background: navy;")], plugin.id)

    expect(document.head.querySelector('style[data-external-theme="user:local"]')).toBeNull()
    expect(
      document.head.querySelector('style[data-external-theme="alice.dusk/dark"]')?.textContent,
    ).toContain("--background: navy;")

    applyExternalThemes([], plugin.id)
    expect(document.head.querySelectorAll("style[data-external-theme]")).toHaveLength(0)
  })

  it.each([loose, plugin])("loads escaped rules only while $id is selected", (theme) => {
    const malicious = withCss(theme, "} button { display:none!important } /*")
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
