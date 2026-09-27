// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { ProviderInfo } from "@/lib/api"

const api = vi.hoisted(() => ({
  providers: { list: vi.fn() },
  notifications: { listen: vi.fn() },
}))

vi.mock("@/hooks/useConnectProvider", () => ({
  useConnectProvider: () => ({ connect: vi.fn(), isConnecting: false }),
}))
vi.mock("@/lib/api", () => ({
  api,
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
}))

const unlisten = vi.fn()
let root: Root
let container: HTMLDivElement

function provider(slug: string, overrides: Partial<ProviderInfo> = {}): ProviderInfo {
  return { slug, name: null, icon: null, source: { kind: "path" }, on_path: true, ...overrides }
}

// The provider store is module state; re-importing starts each test empty.
async function renderProviderList() {
  const { ProviderList } = await import("./ProviderList")
  await act(async () => root.render(<ProviderList onClose={vi.fn()} onSetStep={vi.fn()} />))
}

function emitProvidersChanged() {
  const [name, handler] = api.notifications.listen.mock.calls[0]
  expect(name).toBe("providers-changed")
  handler(null)
}

function buttons() {
  return Array.from(container.querySelectorAll("button"))
}

function buttonLabels() {
  return buttons().map((button) => button.textContent)
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  api.notifications.listen.mockReturnValue({ ready: Promise.resolve(), unlisten })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

it("reloads the providers when a plugin changes them", async () => {
  api.providers.list.mockResolvedValueOnce([provider("google")])
  await renderProviderList()
  expect(buttonLabels()).toEqual(["Google"])

  api.providers.list.mockResolvedValueOnce([provider("google"), provider("hooli")])
  await act(async () => emitProvidersChanged())
  expect(buttonLabels()).toEqual(["Google", "Hooli"])

  await act(async () => root.unmount())
  expect(unlisten).toHaveBeenCalled()
})

it("ignores a reload that resolves after a newer one", async () => {
  let resolveStale: (providers: ProviderInfo[]) => void = () => {}
  api.providers.list
    .mockReturnValueOnce(new Promise((resolve) => (resolveStale = resolve)))
    .mockResolvedValueOnce([provider("google"), provider("hooli")])
  await renderProviderList()

  await act(async () => emitProvidersChanged())
  await act(async () => resolveStale([provider("google")]))
  expect(buttonLabels()).toEqual(["Google", "Hooli"])

  await act(async () => root.unmount())
})

it("shows plugin names and icons, and falls back for unknown providers", async () => {
  const icon = "data:image/svg+xml;base64,PHN2Zy8+"
  api.providers.list.mockResolvedValueOnce([
    provider("google", { source: { kind: "bundled" }, on_path: false }),
    provider("hooli"),
    provider("tuta", { name: "Tuta Mail", icon, source: { kind: "plugin", id: "t4t5.tuta" } }),
  ])
  await renderProviderList()

  expect(buttonLabels()).toEqual(["Google", "Hooli", "Tuta Mail"])
  const [google, hooli, tuta] = buttons()
  expect(google.querySelector("svg")).not.toBeNull()
  expect(hooli.querySelector("svg, img")).toBeNull()
  expect(tuta.querySelector("img")?.getAttribute("src")).toBe(icon)

  await act(async () => root.unmount())
})
