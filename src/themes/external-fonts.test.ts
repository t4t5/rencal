// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, type ExternalTheme, type ExternalThemeFont } from "@/lib/api"

import { ExternalFontManager } from "@/themes/external-fonts"

vi.mock("@/lib/api", () => ({
  api: { themes: { loadFonts: vi.fn() } },
}))

const regular: ExternalThemeFont = {
  family: "Pixel",
  weight: 400,
  style: "normal",
  data: btoa("wOF2font"),
}

function pluginTheme(id: string, packageId = "alice.dusk", version = "1.0.0"): ExternalTheme {
  return {
    id,
    name: id,
    css: "--font-body: Pixel;",
    source: { kind: "plugin", id: packageId, version },
    appearance: "dark",
  }
}

const looseTheme: ExternalTheme = {
  id: "user:local",
  name: "Local",
  css: "--background: black;",
  source: { kind: "loose" },
  appearance: null,
}

class MockFontFace {
  static rejectFamily: string | null = null

  family: string
  source: string | BufferSource
  descriptors: FontFaceDescriptors

  constructor(family: string, source: string | BufferSource, descriptors?: FontFaceDescriptors) {
    this.family = family
    this.source = source
    this.descriptors = descriptors ?? {}
  }

  async load(): Promise<MockFontFace> {
    if (this.family === MockFontFace.rejectFamily) throw new Error("invalid font")
    return this
  }
}

let added: MockFontFace[]
let deleted: MockFontFace[]

beforeEach(() => {
  vi.resetAllMocks()
  added = []
  deleted = []
  MockFontFace.rejectFamily = null
  vi.stubGlobal("FontFace", MockFontFace)
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      add: vi.fn((face: MockFontFace) => {
        added.push(face)
      }),
      delete: vi.fn((face: MockFontFace) => {
        deleted.push(face)
        return true
      }),
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("ExternalFontManager", () => {
  it("registers faces and removes them for built-in and loose themes", async () => {
    vi.mocked(api.themes.loadFonts).mockResolvedValue({ fonts: [regular] })
    const manager = new ExternalFontManager()
    const plugin = pluginTheme("alice.dusk/dark")
    const themes = [plugin, looseTheme]

    manager.update(plugin.id, themes)
    await vi.waitFor(() => expect(added).toHaveLength(1))
    expect(added[0]?.family).toBe("Pixel")
    expect(added[0]?.descriptors).toEqual({ weight: "400", style: "normal" })
    expect(added[0]?.source).toBeInstanceOf(Uint8Array)

    manager.update("ren", themes)
    expect(deleted).toEqual([added[0]])
    manager.update(plugin.id, themes)
    expect(api.themes.loadFonts).toHaveBeenCalledOnce()
    expect(added).toHaveLength(2)
    manager.update(looseTheme.id, themes)
    expect(deleted).toHaveLength(2)
  })

  it("reuses registered faces between themes in the same package", async () => {
    vi.mocked(api.themes.loadFonts).mockResolvedValue({ fonts: [regular] })
    const manager = new ExternalFontManager()
    const dark = pluginTheme("alice.dusk/dark")
    const light = pluginTheme("alice.dusk/light")
    const themes = [dark, light]

    manager.update(dark.id, themes)
    await vi.waitFor(() => expect(added).toHaveLength(1))
    manager.update(light.id, themes)

    expect(api.themes.loadFonts).toHaveBeenCalledOnce()
    expect(added).toHaveLength(1)
    expect(deleted).toHaveLength(0)
  })

  it("does not register a stale asynchronous response", async () => {
    let resolveFirst!: (value: { fonts: ExternalThemeFont[] }) => void
    vi.mocked(api.themes.loadFonts)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ fonts: [regular] })
    const manager = new ExternalFontManager()
    const first = pluginTheme("alice.dusk/dark")
    const second = pluginTheme("bob.dawn/light", "bob.dawn")
    const themes = [first, second]

    manager.update(first.id, themes)
    manager.update(second.id, themes)
    resolveFirst({ fonts: [{ ...regular, family: "Stale" }] })

    await vi.waitFor(() => expect(added).toHaveLength(1))
    expect(added[0]?.family).toBe("Pixel")
  })

  it("invalidates active faces on declaration and version snapshots", async () => {
    vi.mocked(api.themes.loadFonts).mockResolvedValue({ fonts: [regular] })
    const manager = new ExternalFontManager()
    const first = pluginTheme("alice.dusk/dark")

    manager.update(first.id, [first])
    await vi.waitFor(() => expect(added).toHaveLength(1))
    manager.update(first.id, [{ ...first }])
    await vi.waitFor(() => expect(added).toHaveLength(2))
    const updated = pluginTheme(first.id, "alice.dusk", "2.0.0")
    manager.update(updated.id, [updated])

    await vi.waitFor(() => expect(added).toHaveLength(3))
    expect(deleted).toEqual([added[0], added[1]])
    expect(api.themes.loadFonts).toHaveBeenCalledTimes(3)
  })

  it("rolls back an attempt when one face fails", async () => {
    MockFontFace.rejectFamily = "Broken"
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(api.themes.loadFonts).mockResolvedValue({
      fonts: [regular, { ...regular, family: "Broken", weight: 700 }],
    })
    const manager = new ExternalFontManager()
    const plugin = pluginTheme("alice.dusk/dark")

    manager.update(plugin.id, [plugin])

    await vi.waitFor(() => expect(console.error).toHaveBeenCalledOnce())
    expect(added).toHaveLength(1)
    expect(deleted).toEqual([added[0]])
  })

  it("caches an empty font collection without registering faces", async () => {
    vi.mocked(api.themes.loadFonts).mockResolvedValue({ fonts: [] })
    const manager = new ExternalFontManager()
    const plugin = pluginTheme("alice.dusk/dark")
    const themes = [plugin]

    manager.update(plugin.id, themes)
    await vi.waitFor(() => expect(api.themes.loadFonts).toHaveBeenCalledOnce())
    manager.update("ren", themes)
    manager.update(plugin.id, themes)

    expect(api.themes.loadFonts).toHaveBeenCalledOnce()
    expect(added).toHaveLength(0)
  })
})
