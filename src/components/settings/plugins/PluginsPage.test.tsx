// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { api, type InstalledPlugin, type PluginInspection } from "@/lib/api"

import { PluginsPage } from "./PluginsPage"

vi.mock("@/lib/api", () => ({
  api: {
    plugins: {
      list: vi.fn(),
      catalog: vi.fn(),
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
  version: "1.10.0",
  description: "A quiet theme",
  min_rencal_version: "0.7.0",
  compatible: true,
  themes: [{ id: "dark", name: "Dusk Dark", appearance: "dark" }],
}
const installed: InstalledPlugin = {
  id: plugin.id,
  name: plugin.name,
  repo: plugin.repo,
  version: "1.2.0",
  update_version: "1.10.0",
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
  vi.mocked(api.plugins.catalog).mockResolvedValue({ plugins: [plugin], error: null })
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

async function click(label: string) {
  await act(async () => {
    const target = button(label)
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
    target.click()
  })
}

async function searchFor(query: string) {
  const input = document.querySelector<HTMLInputElement>('[aria-label="Search plugins"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, query)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

it("reviews a catalog plugin, installs it, and refreshes the list without selecting a theme", async () => {
  await render()
  await click("Review install")
  expect(api.plugins.inspect).toHaveBeenCalledWith("alice/dusk")
  expect(api.plugins.install).not.toHaveBeenCalled()
  const dialog = document.querySelector('[role="dialog"]')!
  expect(dialog.textContent).toContain("Dusk Dark")
  expect(dialog.textContent).toContain("Compatible")
  expect(dialog.textContent).toContain("unreviewed community packages")
  vi.mocked(api.plugins.list).mockResolvedValue({
    plugins: [{ ...installed, version: plugin.version, update_version: null }],
    errors: [],
  })
  await click("Install")
  expect(api.plugins.install).toHaveBeenCalledWith("alice/dusk")
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.body.textContent).toContain("1.10.0")
  expect(api.themes.setConfigured).not.toHaveBeenCalled()
})

it("blocks incompatible installs and lets the user cancel", async () => {
  vi.mocked(api.plugins.inspect).mockResolvedValue({ ...plugin, compatible: false })
  await render()
  await click("Review install")
  expect(button("Install").disabled).toBe(true)
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Not compatible")
  await click("Cancel")
  expect(api.plugins.install).not.toHaveBeenCalled()
})

it("keeps a failed update review open, then updates and uninstalls without changing selection", async () => {
  vi.mocked(api.plugins.list).mockResolvedValue({ plugins: [installed], errors: [] })
  await render()
  await click("Update to 1.10.0")
  vi.mocked(api.plugins.install).mockRejectedValueOnce(new Error("GitHub rate limit exceeded"))
  await click("Update")
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
    "GitHub rate limit exceeded",
  )
  vi.mocked(api.plugins.list).mockResolvedValue({
    plugins: [{ ...installed, version: plugin.version, update_version: null }],
    errors: [],
  })
  await click("Update")
  expect(document.body.textContent).not.toContain("Update to")
  vi.mocked(api.plugins.uninstall).mockRejectedValueOnce(new Error("Cannot write plugins.toml"))
  await click("Uninstall")
  expect(document.body.textContent).toContain("Cannot write plugins.toml")
  vi.mocked(api.plugins.list).mockResolvedValue({ plugins: [], errors: [] })
  await click("Uninstall")
  expect(api.plugins.uninstall).toHaveBeenCalledWith(plugin.id)
  expect(document.body.textContent).toContain("Review install")
  expect(api.themes.setConfigured).not.toHaveBeenCalled()
})

it("shows installed plugins first and filters the unified list", async () => {
  const anotherPlugin: PluginInspection = {
    ...plugin,
    id: "bob.dawn",
    name: "Dawn",
    repo: "bob/dawn",
    description: "A bright theme",
  }
  vi.mocked(api.plugins.list).mockResolvedValue({ plugins: [installed], errors: [] })
  vi.mocked(api.plugins.catalog).mockResolvedValue({
    plugins: [anotherPlugin, plugin],
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

it("retries the catalog when it is unavailable", async () => {
  vi.mocked(api.plugins.catalog).mockResolvedValue({ plugins: [], error: "Catalog unavailable" })
  await render()
  expect(document.body.textContent).toContain("Catalog unavailable")
  vi.mocked(api.plugins.catalog).mockResolvedValue({ plugins: [plugin], error: null })
  await click("Retry")
  expect(document.body.textContent).toContain("A quiet theme")
})
