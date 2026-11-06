// @vitest-environment happy-dom
import { Temporal } from "@js-temporal/polyfill"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { AvailabilityPanel } from "./AvailabilityPanel"
import { dropDay, pickRange } from "./availability-store"

vi.mock("@/contexts/SettingsContext", () => ({ useSettings: () => ({ timeFormat: "24h" }) }))
vi.mock("@/hooks/useViewerTzid", () => ({ useViewerTzid: () => "Europe/Stockholm" }))

const MONDAY = Temporal.PlainDate.from("2026-11-09")
const TODAY = Temporal.PlainDate.from("2026-11-01")
const TOMORROW = TODAY.add({ days: 1 })
const MORNING = { startMinutes: 9 * 60, endMinutes: 12 * 60 }
const AFTERNOON = { startMinutes: 14 * 60, endMinutes: 15 * 60 }

let root: Root

const message = () => document.querySelector("[data-slot=availability-message]")?.textContent
const dayRows = () => document.querySelectorAll("[data-slot=availability-day]")
const newDayRow = () => document.querySelector("[data-slot=availability-new-day]")
const addDay = () => newDayRow()!.querySelector<HTMLElement>("button[title='Add day']")!.click()
const openDayMenu = () =>
  document
    .querySelector('[aria-label="More options"]')!
    .dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }),
    )
const menuItem = (name: string) =>
  [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find(
    (item) => item.textContent === name,
  )
const clearButton = () =>
  [...document.querySelectorAll<HTMLElement>("button")].find(
    (button) => button.textContent === "Clear",
  )
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
  for (const date of [MONDAY, TODAY, TOMORROW]) dropDay(date)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it("starts with no days, and nothing to copy", async () => {
  await renderPanel()

  expect(dayRows()).toHaveLength(0)
  expect(newDayRow()?.textContent).toContain("Add day")
  expect(message()).toContain("Pick some times")
  expect(copyButton()).toBeNull()
})

it("adds today from nine to five, then the day after", async () => {
  await renderPanel()

  await act(async () => addDay())
  expect(message()).toContain("Sun, 1 Nov: 09:00–17:00")

  await act(async () => addDay())
  expect(dayRows()).toHaveLength(2)
  expect(message()).toContain("Mon, 2 Nov: 09:00–17:00")
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

it("clears a day from its menu", async () => {
  pickRange(MONDAY, MORNING)
  await renderPanel()

  await act(async () => openDayMenu())
  expect(menuItem("Clear first time range")).toBeUndefined()
  await act(async () => menuItem("Clear day")!.click())

  expect(message()).toContain("Pick some times")
  expect(dayRows()).toHaveLength(0)
})

it("clears every day at once, and only offers to when there are some", async () => {
  await renderPanel()
  expect(clearButton()).toBeUndefined()

  await act(async () => {
    pickRange(MONDAY, MORNING)
    pickRange(TOMORROW, AFTERNOON)
  })
  expect(dayRows()).toHaveLength(2)

  await act(async () => clearButton()!.click())
  expect(dayRows()).toHaveLength(0)
  expect(message()).toContain("Pick some times")
  expect(clearButton()).toBeUndefined()
})

it("clears the first time from the menu and later ones with their button", async () => {
  pickRange(MONDAY, MORNING)
  pickRange(MONDAY, AFTERNOON)
  pickRange(MONDAY, { startMinutes: 16 * 60, endMinutes: 17 * 60 })
  await renderPanel()

  await act(async () => openDayMenu())
  await act(async () => menuItem("Clear first time range")!.click())
  expect(message()).toContain("Mon, 9 Nov: 14:00–15:00, or 16:00–17:00")

  await act(async () => {
    document.querySelector<HTMLElement>("button[title='Remove times']")!.click()
  })
  expect(message()).toContain("Mon, 9 Nov: 14:00–15:00")
  expect(message()).not.toContain("16:00")
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
