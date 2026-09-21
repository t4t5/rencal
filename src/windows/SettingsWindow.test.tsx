// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { SettingsWindow } from "./SettingsWindow"

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ close: vi.fn() }),
}))
vi.mock("@/hooks/useTheme", () => ({ useTheme: () => {} }))
vi.mock("@/lib/api", () => ({
  api: { notifications: { listen: () => ({ ready: Promise.resolve(), unlisten: vi.fn() }) } },
}))
vi.mock("@/components/settings/general/GeneralPage", () => ({
  GeneralPage: () => <div>General settings</div>,
}))
vi.mock("@/components/settings/plugins/PluginsPage", () => ({
  PluginsPage: () => <div>Plugin settings</div>,
}))
vi.mock("@/components/settings/accounts/AccountsPage", () => ({ AccountsPage: () => null }))
vi.mock("@/components/settings/calendars/CalendarsPage", () => ({ CalendarsPage: () => null }))
vi.mock("@/components/settings/reminders/RemindersPage", () => ({ RemindersPage: () => null }))
vi.mock("@/components/settings/themes/ThemesPage", () => ({ ThemesPage: () => null }))

let root: Root

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  window.history.replaceState(null, "", "/")
  vi.unstubAllGlobals()
})

async function renderAt(search: string) {
  window.history.replaceState(null, "", `/${search}`)
  await act(async () => root.render(<SettingsWindow />))
}

it("opens the requested plugins tab", async () => {
  await renderAt("?appWindow=settings&tab=plugins")
  expect(document.body.textContent).toContain("Plugin settings")
  expect(document.body.textContent).not.toContain("General settings")
})

it("falls back to General for an unknown tab", async () => {
  await renderAt("?appWindow=settings&tab=unknown")
  expect(document.body.textContent).toContain("General settings")
  expect(document.body.textContent).not.toContain("Plugin settings")
})

it("links the selected settings tab to its panel and switches on click", async () => {
  await renderAt("?appWindow=settings&tab=plugins")
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
  expect(tabs).toHaveLength(6)
  expect(document.querySelector('[role="tablist"]')?.getAttribute("aria-orientation")).toBe(
    "vertical",
  )
  const plugins = tabs.find((tab) => tab.textContent === "Plugins")!
  const general = tabs.find((tab) => tab.textContent === "General")!
  expect(plugins.getAttribute("aria-selected")).toBe("true")
  const panel = document.getElementById(plugins.getAttribute("aria-controls")!)!
  expect(panel.getAttribute("aria-labelledby")).toBe(plugins.id)
  expect(panel.textContent).toContain("Plugin settings")

  await act(async () =>
    general.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })),
  )
  expect(general.getAttribute("aria-selected")).toBe("true")
  expect(plugins.getAttribute("aria-selected")).toBe("false")
  expect(document.body.textContent).toContain("General settings")
  expect(document.body.textContent).not.toContain("Plugin settings")
})

it("navigates settings vertically with the arrow keys", async () => {
  await renderAt("?appWindow=settings")
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
  await act(async () => tabs[0].focus())
  await act(async () => {
    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  expect(document.activeElement).toBe(tabs[1])
  expect(tabs[1].getAttribute("aria-selected")).toBe("true")
  expect(tabs[0].getAttribute("aria-selected")).toBe("false")
})
