// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { VisibleHoursSection } from "./VisibleHoursSection"

const state = vi.hoisted(() => ({
  visibleHours: null as { start_hour: number; end_hour: number } | null,
  setVisibleHours: vi.fn(),
  timeFormat: "24h",
}))
vi.mock("@/contexts/SettingsContext", () => ({ useSettings: () => state }))
vi.mock("@/lib/api", () => ({
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}))
vi.mock("@/lib/event-time", () => ({
  formatWallclockTime: (hour: number) => `${String(hour).padStart(2, "0")}:00`,
}))

let root: Root

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  state.visibleHours = null
  state.timeFormat = "24h"
  state.setVisibleHours.mockResolvedValue(undefined)
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

async function render() {
  await act(async () => root.render(<VisibleHoursSection />))
}

it("offers an optional 08:00–20:00 range with labeled, disabled time controls", async () => {
  await render()
  const checkbox = document.querySelector<HTMLButtonElement>('[role="checkbox"]')!
  expect(checkbox.getAttribute("aria-checked")).toBe("false")
  const controls = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="combobox"]'))
  expect(controls).toHaveLength(2)
  expect(controls.every((control) => control.disabled)).toBe(true)
  expect(
    controls.map((control) => document.querySelector(`label[for="${control.id}"]`)?.textContent),
  ).toEqual(["Start", "End"])
  await act(async () => checkbox.click())
  expect(state.setVisibleHours).toHaveBeenCalledWith({ start_hour: 8, end_hour: 20 })
})

it("lets the user disable a saved range", async () => {
  state.visibleHours = { start_hour: 7, end_hour: 22 }
  await render()
  const controls = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="combobox"]'))
  expect(controls.every((control) => !control.disabled)).toBe(true)
  expect(controls[0].textContent).toContain("07:00")
  expect(controls[1].textContent).toContain("22:00")
  await act(async () => document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click())
  expect(state.setVisibleHours).toHaveBeenCalledWith(null)
})

it.each([0, 1])("only offers valid hours for the %s time selector", async (index) => {
  state.visibleHours = { start_hour: 8, end_hour: 20 }
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {})
  await render()
  const control = document.querySelectorAll('[role="combobox"]')[index]
  await act(async () => {
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
  })
  const options = Array.from(document.querySelectorAll('[role="option"]'))
  const labels = options.map((option) => option.textContent)
  if (index === 0) {
    expect(labels).toHaveLength(20)
    expect(labels[0]).toBe("00:00")
    expect(labels.at(-1)).toBe("19:00")
  } else {
    expect(labels).toHaveLength(16)
    expect(labels[0]).toBe("09:00")
    expect(labels.at(-1)).toBe("24:00")
  }
  await act(async () => options[0].dispatchEvent(new MouseEvent("click", { bubbles: true })))
  expect(state.setVisibleHours).toHaveBeenCalledWith(
    index === 0 ? { start_hour: 0, end_hour: 20 } : { start_hour: 8, end_hour: 9 },
  )
  vi.restoreAllMocks()
})

it("shows save errors and re-enables the controls for a retry", async () => {
  state.setVisibleHours.mockRejectedValue(new Error("permission denied"))
  await render()
  await act(async () => document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click())
  expect(document.querySelector('[role="alert"]')?.textContent).toBe("permission denied")
  expect(document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.disabled).toBe(false)
})

it("labels the end of the day explicitly in both time formats", async () => {
  state.visibleHours = { start_hour: 0, end_hour: 24 }
  await render()
  expect(document.querySelectorAll('[role="combobox"]')[1].textContent).toContain("24:00")
  state.timeFormat = "12h"
  await render()
  expect(document.querySelectorAll('[role="combobox"]')[1].textContent).toContain(
    "12:00 AM (end of day)",
  )
})
