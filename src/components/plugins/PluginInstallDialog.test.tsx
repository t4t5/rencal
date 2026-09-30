// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { toast } from "sonner"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { api, type InstalledPlugin, type PluginCatalogEntry } from "@/lib/api"

import { PluginInstallDialog } from "./PluginInstallDialog"

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const listeners = new Map<string, () => void>()

vi.mock("@/lib/api", () => ({
  api: {
    plugins: {
      list: vi.fn(),
      catalog: vi.fn(),
      takePendingInstall: vi.fn(),
      install: vi.fn(),
      uninstall: vi.fn(),
    },
    notifications: {
      listen: (name: string, callback: () => void) => {
        listeners.set(name, callback)
        return { ready: Promise.resolve(), unlisten: vi.fn() }
      },
    },
  },
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}))

const entry: PluginCatalogEntry = {
  id: "alice.dusk",
  name: "Dusk",
  repo: "alice/dusk",
  description: "A quiet theme",
  tag: "v1.10.0",
  contributions: ["theme"],
  preview_url: "https://example.com/dusk.png",
}
const installed: InstalledPlugin = {
  id: entry.id,
  name: entry.name,
  description: null,
  contributions: ["theme"],
  preview_url: null,
  repo: entry.repo,
  local_dir: null,
  version: entry.tag,
  update_version: null,
  error: null,
}
let root: Root

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.resetAllMocks()
  listeners.clear()
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(api.plugins.list).mockResolvedValue({ plugins: [], errors: [] })
  vi.mocked(api.plugins.catalog).mockResolvedValue({ plugins: [entry], error: null })
  vi.mocked(api.plugins.takePendingInstall).mockResolvedValue(null)
  vi.mocked(api.plugins.install).mockResolvedValue({
    ...entry,
    version: entry.tag,
    min_rencal_version: "0.7.0",
    compatible: true,
    themes: [],
    fonts: [],
    providers: [],
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

async function render() {
  await act(async () => root.render(<PluginInstallDialog />))
}

const dialog = () => document.querySelector('[role="dialog"]')
const dialogText = () => dialog()?.textContent ?? ""

function button(label: string) {
  const match = [...document.querySelectorAll("button")].find(
    (element) => element.textContent === label,
  )
  if (!match) throw new Error(`Button ${label} not found: ${document.body.textContent}`)
  return match
}

async function click(label: string) {
  await act(async () => button(label).click())
}

it("does nothing when there is no pending install link", async () => {
  await render()
  expect(api.plugins.takePendingInstall).toHaveBeenCalledOnce()
  expect(dialog()).toBeNull()
})

it("describes a catalog plugin with its preview and installs it", async () => {
  vi.mocked(api.plugins.takePendingInstall).mockResolvedValueOnce({ repo: "alice/dusk" })
  await render()
  expect(dialogText()).toContain("A quiet theme")
  expect(dialogText()).toContain("v1.10.0")
  expect(dialog()?.querySelector("img")?.getAttribute("src")).toBe(entry.preview_url)

  await click("Install")
  expect(api.plugins.install).toHaveBeenCalledWith("alice/dusk")
  expect(toast.success).toHaveBeenCalledExactlyOnceWith("Installed Dusk")
  expect(dialog()).toBeNull()
})

it("describes a link to a plugin that isn't in the catalog", async () => {
  vi.mocked(api.plugins.takePendingInstall).mockResolvedValueOnce({ repo: "bob/rencal-dawn" })
  await render()
  expect(dialogText()).toContain("rencal-dawn")
  expect(dialogText()).toContain("isn't listed in the renCal catalog")
  await click("Install")
  expect(api.plugins.install).toHaveBeenCalledWith("bob/rencal-dawn")
})

it("shows an already installed plugin with its uninstall action", async () => {
  vi.mocked(api.plugins.list).mockResolvedValue({ plugins: [installed], errors: [] })
  vi.mocked(api.plugins.takePendingInstall).mockResolvedValueOnce({ repo: "Alice/Dusk" })
  await render()
  expect(dialogText()).toContain("Installed")
  expect(button("Uninstall")).toBeTruthy()
  expect(() => button("Install")).toThrow()
})

it("keeps an install error in the dialog", async () => {
  vi.mocked(api.plugins.install).mockRejectedValueOnce(new Error("Dusk requires renCal 9.0.0"))
  vi.mocked(api.plugins.takePendingInstall).mockResolvedValueOnce({ repo: "alice/dusk" })
  await render()
  await click("Install")
  expect(dialogText()).toContain("Dusk requires renCal 9.0.0")
  expect(button("Install").disabled).toBe(false)
})

it("opens links that arrive while the app is running", async () => {
  await render()
  expect(dialog()).toBeNull()
  vi.mocked(api.plugins.takePendingInstall).mockResolvedValueOnce({ repo: "alice/dusk" })
  await act(async () => listeners.get("plugin-deep-link-available")?.())
  expect(dialogText()).toContain("A quiet theme")
})

it("holds a new link until the running install finishes", async () => {
  let finishInstall = () => {}
  vi.mocked(api.plugins.install).mockReturnValueOnce(
    new Promise((resolve) => {
      finishInstall = () => resolve(undefined as never)
    }),
  )
  vi.mocked(api.plugins.takePendingInstall).mockResolvedValueOnce({ repo: "alice/dusk" })
  await render()
  await click("Install")
  expect(button("Installing…").disabled).toBe(true)

  await act(async () => listeners.get("plugin-deep-link-available")?.())
  expect(api.plugins.takePendingInstall).toHaveBeenCalledOnce()

  vi.mocked(api.plugins.takePendingInstall).mockResolvedValueOnce({ repo: "bob/rencal-dawn" })
  await act(async () => finishInstall())
  expect(dialogText()).toContain("rencal-dawn")
})
