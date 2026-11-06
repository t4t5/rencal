// @vitest-environment happy-dom
import { Temporal } from "@js-temporal/polyfill"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { AvailabilityPanel } from "./AvailabilityPanel"
import { forgetUnticked, pickRange, tickDay } from "./availability-store"

vi.mock("@/contexts/SettingsContext", () => ({ useSettings: () => ({ timeFormat: "24h" }) }))
vi.mock("@/hooks/useViewerTzid", () => ({ useViewerTzid: () => "Europe/Stockholm" }))

const MONDAY = Temporal.PlainDate.from("2026-11-09")
const MORNING = { startMinutes: 9 * 60, endMinutes: 12 * 60 }

let root: Root

const message = () => document.querySelector("[data-slot=availability-message]")?.textContent
const dayRows = () => document.querySelectorAll("[data-slot=availability-day]")
const copyButton = () => document.querySelector<HTMLElement>("button[aria-label='Copy message']")
const writeText = vi.fn(() => Promise.resolve())

const renderPanel = () => act(async () => root.render(<AvailabilityPanel />))

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
  writeText.mockClear()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"))
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  tickDay(MONDAY, false)
  forgetUnticked()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it("starts with just the placeholder, and nothing to copy", async () => {
  await renderPanel()

  expect(dayRows()).toHaveLength(0)
  expect(document.querySelector("[data-slot=availability-new-day]")).not.toBeNull()
  expect(message()).toContain("Pick some times")
  expect(copyButton()).toBeNull()
})

it("turns a picked time into the message", async () => {
  pickRange(MONDAY, MORNING)
  await renderPanel()

  expect(dayRows()).toHaveLength(1)
  expect(message()).toBe(
    "Would 30 minutes during any of these times work for you? (all Central European Time)\nMon, 9 Nov: 09:00–12:00",
  )
  expect(copyButton()).not.toBeNull()
})

it("drops an unticked date from the message but keeps its row until you leave", async () => {
  pickRange(MONDAY, MORNING)
  await renderPanel()

  await act(async () => {
    document.querySelector<HTMLElement>("[data-slot=availability-day] [role=checkbox]")!.click()
  })

  expect(message()).toContain("Pick some times")
  expect(dayRows()).toHaveLength(1)

  await act(async () => forgetUnticked())
  expect(dayRows()).toHaveLength(0)
})

it("copies on a click anywhere in the box and shows it worked", async () => {
  pickRange(MONDAY, MORNING)
  await renderPanel()

  await act(async () => {
    document.querySelector<HTMLElement>("[data-slot=availability-message]")!.click()
  })

  expect(writeText).toHaveBeenCalledWith(message())
  expect(copyButton()).toBeNull()
  expect(document.querySelector(".group button")?.textContent).toBe("Copied!")
})

it("leaves the clipboard alone when you've selected part of the text", async () => {
  pickRange(MONDAY, MORNING)
  await renderPanel()
  vi.spyOn(window, "getSelection").mockReturnValue({
    toString: () => "09:00",
  } as unknown as Selection)

  await act(async () => {
    document.querySelector<HTMLElement>("[data-slot=availability-message]")!.click()
  })

  expect(writeText).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})
