// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { toast } from "sonner"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { api, type UserKeyBinding } from "@/lib/api"

import { ShortcutsPage } from "./ShortcutsPage"

// The real views pull in the Tauri RPC proxy, which needs a window.
vi.mock("@/views/builtin/week/WeekView", () => ({ WeekView: () => null }))
vi.mock("@/views/builtin/month/MonthView", () => ({ MonthView: () => null }))
vi.mock("@/views/builtin/year/YearView", () => ({ YearView: () => null }))

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

vi.mock("@/lib/api", () => ({
  api: {
    keys: { get: vi.fn(), edit: vi.fn() },
    views: { listExternal: vi.fn() },
    notifications: { listen: vi.fn() },
  },
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}))

let root: Root

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.resetAllMocks()
  vi.mocked(api.notifications.listen).mockReturnValue({
    ready: Promise.resolve(),
    unlisten: vi.fn(),
  })
  vi.mocked(api.views.listExternal).mockResolvedValue({
    views: [
      { id: "t4t5.board/board", plugin_id: "t4t5.board", name: "Board", script: "", css: null },
    ],
  })
  vi.mocked(api.keys.edit).mockResolvedValue({ bindings: [], error: null })
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

async function render(bindings: UserKeyBinding[] = []) {
  vi.mocked(api.keys.get).mockResolvedValue({ bindings, error: null })
  await act(async () => root.render(<ShortcutsPage />))
}

function row(label: string) {
  const match = [...document.querySelectorAll("[data-slot=shortcut-row]")].find(
    (element) => element.firstElementChild?.textContent === label,
  )
  if (!match) throw new Error(`Row ${label} not found: ${document.body.textContent}`)
  return match as HTMLElement
}

function button(scope: HTMLElement, label: string) {
  const match = scope.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!match) throw new Error(`Button ${label} not found`)
  return match
}

async function press(init: KeyboardEventInit) {
  const capture = document.activeElement
  if (!(capture instanceof HTMLButtonElement)) throw new Error("No key capture is focused")
  await act(async () => {
    capture.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }))
  })
}

it("lists each action with its keys, including plugin views", async () => {
  await render()
  expect(row("Next day").textContent).toContain("L")
  expect(row("Display board view").textContent).toContain("None")
})

it("unbinds a default key", async () => {
  await render()
  await act(async () => button(row("Toggle sidebar"), "Remove Ctrl+B from Toggle sidebar").click())
  expect(api.keys.edit).toHaveBeenCalledExactlyOnceWith([{ kind: "unbind", keys: "ctrl+b" }])
})

it("binds the next key pressed, and says when it moves from another action", async () => {
  await render()
  await act(async () => button(row("Go to today"), "Add a key for Go to today").click())
  await press({ key: "n", code: "KeyN" })
  expect(api.keys.edit).toHaveBeenLastCalledWith([
    { kind: "bind", keys: "n", action: "date.today" },
  ])
  expect(toast).not.toHaveBeenCalled()

  await act(async () => button(row("Go to today"), "Add a key for Go to today").click())
  await press({ key: "l", code: "KeyL" })
  await act(async () => {})
  expect(toast).toHaveBeenCalledWith("L now runs “Go to today” instead of “Next day”")
})

it("cancels capturing on Escape without saving", async () => {
  await render()
  await act(async () => button(row("Go to today"), "Add a key for Go to today").click())
  await press({ key: "Escape", code: "Escape" })
  expect(api.keys.edit).not.toHaveBeenCalled()
  expect(document.body.textContent).not.toContain("Press keys…")
})

it("restores an action's default keys", async () => {
  await render([
    { keys: "w", action: "date.today" },
    { keys: "ctrl+b", action: null },
  ])
  expect(row("Display week view").textContent).toContain("None")
  await act(async () => button(row("Display week view"), "Restore default keys").click())
  expect(api.keys.edit).toHaveBeenCalledExactlyOnceWith([{ kind: "clear", keys: "w" }])
})
