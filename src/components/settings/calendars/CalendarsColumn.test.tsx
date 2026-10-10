// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { api } from "@/lib/api"

import { CalendarsColumn } from "./CalendarsColumn"

const reloadCalendars = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock("@/contexts/CalendarStateContext", () => ({
  useCalendars: () => ({ calendars: [], reloadCalendars }),
}))
vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({ groups: {}, setGroups: vi.fn() }),
}))
vi.mock("@/hooks/useProviders", () => ({ useProviders: () => ({ providers: [] }) }))
vi.mock("@/hooks/useConnectProvider", () => ({
  useConnectProvider: () => ({ connectWithCredentials: vi.fn(), isConnecting: false }),
}))
vi.mock("@/lib/api", () => ({
  api: { calendars: { create: vi.fn(() => Promise.resolve()) } },
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
}))

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
  vi.unstubAllGlobals()
})

const button = (label: string) =>
  Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === label)!

it("creates a local calendar from the calendars page", async () => {
  await act(async () => root.render(<CalendarsColumn selectedGroup="default" />))
  await act(async () => button("New calendar").click())

  const input = document.querySelector<HTMLInputElement>("input[placeholder='Calendar name']")!
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    setValue.call(input, "Work")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await act(async () => button("Create calendar").click())

  expect(api.calendars.create).toHaveBeenCalledWith("Work", "#7986cb")
  expect(reloadCalendars).toHaveBeenCalled()
  expect(document.querySelector("input[placeholder='Calendar name']")).toBeNull()
})
