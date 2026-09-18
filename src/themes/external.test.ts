// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"

import type { ExternalTheme } from "@/lib/api"

import { applyExternalThemes, externalThemeDescriptor } from "@/themes/external"

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
    applyExternalThemes([loose, plugin])
    expect(document.head.querySelectorAll("style[data-external-theme]")).toHaveLength(2)

    applyExternalThemes([{ ...plugin, css: "--background: navy;" }])

    expect(document.head.querySelector('style[data-external-theme="user:local"]')).toBeNull()
    expect(
      document.head.querySelector('style[data-external-theme="alice.dusk/dark"]')?.textContent,
    ).toContain("--background: navy;")
  })
})
