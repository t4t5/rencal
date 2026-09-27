// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { api } from "@/lib/api"

import { ProviderList } from "./ProviderList"

vi.mock("@/hooks/useConnectProvider", () => ({
  useConnectProvider: () => ({ connect: vi.fn(), isConnecting: false }),
}))
vi.mock("@/lib/api", () => ({
  api: {
    providers: { list: vi.fn() },
    notifications: { listen: vi.fn() },
  },
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
}))

const unlisten = vi.fn()
let root: Root
let container: HTMLDivElement

function emitProvidersChanged() {
  const [name, handler] = vi.mocked(api.notifications.listen).mock.calls[0]
  expect(name).toBe("providers-changed")
  handler(null)
}

function buttonLabels() {
  return Array.from(container.querySelectorAll("button"), (button) => button.textContent)
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  vi.mocked(api.notifications.listen).mockReturnValue({ ready: Promise.resolve(), unlisten })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

it("reloads the providers when a plugin changes them", async () => {
  vi.mocked(api.providers.list).mockResolvedValueOnce(["google"])
  await act(async () => root.render(<ProviderList onClose={vi.fn()} onSetStep={vi.fn()} />))
  expect(buttonLabels()).toEqual(["Google"])

  vi.mocked(api.providers.list).mockResolvedValueOnce(["google", "hooli"])
  await act(async () => emitProvidersChanged())
  expect(buttonLabels()).toEqual(["Google", "Hooli"])

  await act(async () => root.unmount())
  expect(unlisten).toHaveBeenCalled()
})

it("ignores a reload that resolves after a newer one", async () => {
  let resolveStale: (providers: string[]) => void = () => {}
  vi.mocked(api.providers.list)
    .mockReturnValueOnce(new Promise((resolve) => (resolveStale = resolve)))
    .mockResolvedValueOnce(["google", "hooli"])
  await act(async () => root.render(<ProviderList onClose={vi.fn()} onSetStep={vi.fn()} />))

  await act(async () => emitProvidersChanged())
  await act(async () => resolveStale(["google"]))
  expect(buttonLabels()).toEqual(["Google", "Hooli"])

  await act(async () => root.unmount())
})
