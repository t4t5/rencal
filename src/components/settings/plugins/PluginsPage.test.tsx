// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
  api,
  type InstalledPlugin,
  type PluginCatalogEntry,
  type PluginInspection,
} from "@/lib/api"

import { PluginsPage } from "./PluginsPage"

vi.mock("@/lib/api", () => ({
  api: {
    plugins: {
      list: vi.fn(),
      catalog: vi.fn(),
      takePendingInstall: vi.fn(),
      inspect: vi.fn(),
      install: vi.fn(),
      uninstall: vi.fn(),
    },
    themes: { setConfigured: vi.fn() },
    notifications: { listen: () => ({ ready: Promise.resolve(), unlisten: vi.fn() }) },
  },
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}))

const plugin: PluginInspection = {
  id: "alice.dusk",
  name: "Dusk",
  repo: "alice/dusk",
  version: "v1.10.0",
  description: "A quiet theme",
  min_rencal_version: "0.7.0",
  compatible: true,
  themes: [{ id: "dark", name: "Dusk Dark", appearance: "dark" }],
  fonts: [
    {
      family: "Pixel",
      file: "fonts/pixel-bold.woff2",
      weight: 700,
      style: "normal",
    },
  ],
  providers: [],
}
const entry: PluginCatalogEntry = { ...plugin, tag: "v1.10.0" }
const installed: InstalledPlugin = {
  id: plugin.id,
  name: plugin.name,
  repo: plugin.repo,
  local_dir: null,
  version: "v1.2.0",
  update_version: "v1.10.0",
  error: null,
}
let root: Root

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.resetAllMocks()
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(api.plugins.list).mockResolvedValue({ plugins: [], errors: [] })
  vi.mocked(api.plugins.catalog).mockResolvedValue({ plugins: [entry], error: null })
  vi.mocked(api.plugins.takePendingInstall).mockResolvedValue(null)
  vi.mocked(api.plugins.inspect).mockResolvedValue(plugin)
  vi.mocked(api.plugins.install).mockResolvedValue(plugin)
  vi.mocked(api.plugins.uninstall).mockResolvedValue(undefined)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

async function render() {
  await act(async () => root.render(<PluginsPage />))
}

function button(label: string) {
  const match = [...document.querySelectorAll("button")].find(
    (element) => element.textContent === label,
  )
  if (!match) throw new Error(`Button ${label} not found: ${document.body.textContent}`)
  return match
}

function card(name: string) {
  const match = [...document.querySelectorAll("h3")].find((heading) => heading.textContent === name)
  const target = match?.closest("button")
  if (!target) throw new Error(`Card ${name} not found: ${document.body.textContent}`)
  return target
}

async function press(target: HTMLElement) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
    target.click()
  })
}

const click = (label: string) => press(button(label))
const open = (name: string) => press(card(name))
const sheetText = () => document.querySelector('[role="dialog"]')?.textContent ?? ""

async function searchFor(query: string) {
  const input = document.querySelector<HTMLInputElement>('[aria-label="Search plugins"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, query)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

it("describes a catalog plugin, installs it, and refreshes the list without selecting a theme", async () => {
  await render()
  expect(card("Dusk").textContent).not.toContain("Installed")
  await open("Dusk")
  expect(api.plugins.inspect).toHaveBeenCalledWith("alice/dusk")
  expect(api.plugins.install).not.toHaveBeenCalled()
  expect(sheetText()).toContain("Dusk Dark")
  expect(sheetText()).toContain("Pixel · 700 · normal · pixel-bold.woff2")
  expect(sheetText()).toContain("Compatible")
  expect(sheetText()).toContain("unreviewed community packages")
  expect(() => button("Uninstall")).toThrow()
  vi.mocked(api.plugins.list).mockResolvedValue({
    plugins: [{ ...installed, version: plugin.version, update_version: null }],
    errors: [],
  })
  await click("Install")
  expect(api.plugins.install).toHaveBeenCalledWith("alice/dusk")
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(card("Dusk").textContent).toContain("Installed")
  expect(api.themes.setConfigured).not.toHaveBeenCalled()
})

it("omits the font section for a package without fonts", async () => {
  vi.mocked(api.plugins.inspect).mockResolvedValue({ ...plugin, fonts: [] })
  await render()
  await open("Dusk")
  expect(sheetText()).not.toContain("Fonts")
})

it("describes a provider-only plugin without the theme hint", async () => {
  vi.mocked(api.plugins.inspect).mockResolvedValue({
    ...plugin,
    themes: [],
    fonts: [],
    providers: [
      {
        slug: "tuta",
        name: "Tuta",
        asset: "caldir-provider-tuta-x86_64-unknown-linux-musl.tar.gz",
        compatible: true,
      },
      { slug: "proton", name: "Proton", asset: null, compatible: true },
    ],
  })
  await render()
  await open("Dusk")
  expect(sheetText()).toContain("Calendar providers")
  expect(sheetText()).toContain(
    "Adds the Tuta calendar provider (runs caldir-provider-tuta to sync accounts)",
  )
  expect(sheetText()).toContain("Proton · not available for this platform")
  expect(sheetText()).not.toContain("Themes")
  expect(sheetText()).not.toContain("Choose a theme")
})

it("describes an install received from a deep link", async () => {
  vi.mocked(api.plugins.takePendingInstall).mockResolvedValueOnce({ repo: "alice/dusk" })
  await render()
  expect(api.plugins.inspect).toHaveBeenCalledWith("alice/dusk")
  expect(sheetText()).toContain("Dusk")
  expect(button("Install").disabled).toBe(false)
})

it("does nothing when there is no pending deep-link install", async () => {
  await render()
  expect(api.plugins.takePendingInstall).toHaveBeenCalledOnce()
  expect(api.plugins.inspect).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it("blocks incompatible installs", async () => {
  vi.mocked(api.plugins.inspect).mockResolvedValue({ ...plugin, compatible: false })
  await render()
  await open("Dusk")
  expect(button("Install").disabled).toBe(true)
  expect(sheetText()).toContain("Not compatible")
})

it("keeps a failed update open, then updates and uninstalls without changing selection", async () => {
  vi.mocked(api.plugins.list).mockResolvedValue({ plugins: [installed], errors: [] })
  await render()
  expect(card("Dusk").textContent).toContain("Update available")
  await open("Dusk")
  expect(sheetText()).toContain("v1.2.0 · v1.10.0 available")
  vi.mocked(api.plugins.install).mockRejectedValueOnce(new Error("GitHub rate limit exceeded"))
  await click("Update to v1.10.0")
  expect(sheetText()).toContain("GitHub rate limit exceeded")
  vi.mocked(api.plugins.list).mockResolvedValue({
    plugins: [{ ...installed, version: plugin.version, update_version: null }],
    errors: [],
  })
  await click("Update to v1.10.0")
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(card("Dusk").textContent).toContain("Installed")

  await open("Dusk")
  expect(() => button("Update to v1.10.0")).toThrow()
  vi.mocked(api.plugins.uninstall).mockRejectedValueOnce(new Error("Cannot write plugins.toml"))
  await click("Uninstall")
  expect(sheetText()).toContain("Cannot write plugins.toml")
  vi.mocked(api.plugins.list).mockResolvedValue({ plugins: [], errors: [] })
  await click("Uninstall")
  expect(api.plugins.uninstall).toHaveBeenCalledWith(plugin.id)
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(card("Dusk").textContent).not.toContain("Installed")
  expect(api.themes.setConfigured).not.toHaveBeenCalled()
})

it("shows installed plugins first and filters the grid", async () => {
  const anotherPlugin: PluginCatalogEntry = {
    ...entry,
    id: "bob.dawn",
    name: "Dawn",
    repo: "bob/dawn",
    description: "A bright theme",
  }
  vi.mocked(api.plugins.list).mockResolvedValue({ plugins: [installed], errors: [] })
  vi.mocked(api.plugins.catalog).mockResolvedValue({
    plugins: [anotherPlugin, entry],
    error: null,
  })
  await render()
  expect([...document.querySelectorAll("h3")].map((heading) => heading.textContent)).toEqual([
    "Dusk",
    "Dawn",
  ])

  await searchFor("bright")
  expect(document.body.textContent).toContain("Dawn")
  expect(document.body.textContent).not.toContain("Dusk")
  await searchFor("missing")
  expect(document.body.textContent).toContain("No plugins match your search.")
})

it("marks calendar provider plugins from the catalog", async () => {
  vi.mocked(api.plugins.catalog).mockResolvedValue({
    plugins: [
      entry,
      {
        id: "alice.tuta",
        name: "Tuta",
        repo: "alice/caldir-provider-tuta",
        description: "Sync your Tuta calendars",
        tag: "v0.2.0",
        contributions: ["provider"],
      },
    ],
    error: null,
  })
  await render()
  const meta = [...document.querySelectorAll("h3 + p")].map((element) => element.textContent)
  expect(meta).toEqual(["alice", "alice · Calendar provider"])

  await searchFor("provider")
  expect(document.body.textContent).toContain("Tuta")
  expect(document.body.textContent).not.toContain("Dusk")
})

it("describes a local checkout with only an uninstall action", async () => {
  vi.mocked(api.plugins.list).mockResolvedValue({
    plugins: [
      {
        ...installed,
        local_dir: "/home/alice/dev/rencal-dusk",
        update_version: "v9.0.0",
        error: "Package files are missing",
      },
    ],
    errors: [],
  })
  await render()
  await searchFor("/home/alice/dev")
  expect(card("Dusk").textContent).toContain("Package files are missing")
  await open("Dusk")

  expect(api.plugins.inspect).not.toHaveBeenCalled()
  expect(sheetText()).toContain("/home/alice/dev/rencal-dusk")
  expect(sheetText()).not.toContain("Update to")
  expect(sheetText()).not.toContain("Reinstall")
  expect(button("Uninstall")).toBeTruthy()
})

it("retries the catalog when it is unavailable", async () => {
  vi.mocked(api.plugins.catalog).mockResolvedValue({ plugins: [], error: "Catalog unavailable" })
  await render()
  expect(document.body.textContent).toContain("Catalog unavailable")
  vi.mocked(api.plugins.catalog).mockResolvedValue({ plugins: [entry], error: null })
  await click("Retry")
  expect(document.body.textContent).toContain("A quiet theme")
})
