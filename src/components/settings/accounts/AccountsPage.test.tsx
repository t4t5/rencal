// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { api, type Calendar, type ProviderInfo } from "@/lib/api"

import { AccountsPage } from "./AccountsPage"

const calendars = vi.hoisted((): Calendar[] => [])
const reloadCalendars = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock("@/contexts/CalendarStateContext", () => ({
  useCalendars: () => ({ calendars, reloadCalendars }),
}))
vi.mock("@/hooks/useConnectProvider", () => ({
  useConnectProvider: () => ({ connect: vi.fn(), isConnecting: false }),
}))
vi.mock("@/lib/api", () => ({
  api: {
    providers: {
      list: vi.fn(),
      checkConnection: vi.fn(() => Promise.resolve()),
      removeAccount: vi.fn(() => Promise.resolve()),
    },
    notifications: { listen: () => ({ ready: Promise.resolve(), unlisten: vi.fn() }) },
  },
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
}))

let root: Root

function account(provider: string): Calendar {
  return {
    slug: provider,
    name: null,
    color: null,
    provider,
    account: `me@${provider}.example`,
    read_only: null,
  }
}

function plugin(slug: string): ProviderInfo {
  const source = { kind: "plugin" as const, id: `alice.${slug}` }
  return { slug, name: `${slug} Mail`, icon: null, source, on_path: false }
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

it("shows provider display names", async () => {
  calendars.splice(0, calendars.length, account("tuta"), account("hooli"), account("etesync"))
  vi.mocked(api.providers.list).mockResolvedValue([
    { slug: "etesync", name: null, icon: null, source: { kind: "path" }, on_path: true },
    plugin("hooli"),
    plugin("tuta"),
  ])

  await act(async () => root.render(<AccountsPage />))

  const text = document.body.textContent ?? ""
  expect(text).toContain("tuta Mail")
  expect(text).toContain("hooli Mail")
  expect(text).toContain("Etesync")
})

it("removes an account after confirming", async () => {
  calendars.splice(0, calendars.length, account("icloud"), { ...account("icloud"), slug: "work" })
  vi.mocked(api.providers.list).mockResolvedValue([])

  await act(async () => root.render(<AccountsPage />))
  await act(async () => {
    document
      .querySelector('[aria-label="More options"]')!
      .dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }),
      )
  })
  const removeItem = [...document.querySelectorAll('[role="menuitem"]')].find(
    (item) => item.textContent === "Remove account...",
  ) as HTMLElement
  await act(async () => removeItem.click())

  expect(document.body.textContent).toContain(
    'Remove "me@icloud.example"? This will remove its 2 calendars from this computer.',
  )

  const confirm = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Remove account",
  )!
  await act(async () => confirm.click())

  expect(api.providers.removeAccount).toHaveBeenCalledWith("icloud", "me@icloud.example")
  expect(reloadCalendars).toHaveBeenCalled()
})
