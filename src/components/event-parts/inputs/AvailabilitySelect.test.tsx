// @vitest-environment happy-dom
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { EventAvailability } from "@/lib/cal-events"

import { AvailabilitySelect } from "./AvailabilitySelect"

let root: Root
const changed = vi.fn()

function Field({
  initial = "busy",
  readOnly = false,
}: {
  initial?: EventAvailability
  readOnly?: boolean
}) {
  const [value, setValue] = useState(initial)
  return (
    <AvailabilitySelect
      value={value}
      readOnly={readOnly}
      onChange={(next) => {
        changed(next)
        setValue(next)
      }}
    />
  )
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {})
  changed.mockReset()
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each(["busy", "free"] as const)(
  "displays the stored %s value and allows changing it",
  async (initial) => {
    await act(async () => root.render(<Field initial={initial} />))
    const trigger = document.querySelector<HTMLButtonElement>('[role="combobox"]')!
    expect(trigger.getAttribute("aria-label")).toBe("Show as")
    expect(trigger.textContent).toContain(initial === "busy" ? "Busy" : "Free")
    await act(async () =>
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
    )
    const next = initial === "busy" ? "Free" : "Busy"
    const option = Array.from(document.querySelectorAll('[role="option"]')).find(
      (el) => el.textContent === next,
    )!
    await act(async () => option.dispatchEvent(new MouseEvent("click", { bubbles: true })))
    expect(changed).toHaveBeenCalledWith(next.toLowerCase())
    expect(trigger.textContent).toContain(next)
  },
)

it("shows availability without allowing changes on a read-only event", async () => {
  await act(async () => root.render(<Field initial="free" readOnly />))
  const trigger = document.querySelector<HTMLButtonElement>('[role="combobox"]')!
  expect(trigger.disabled).toBe(true)
  expect(trigger.textContent).toContain("Free")
  await act(async () => trigger.click())
  expect(document.querySelector('[role="option"]')).toBeNull()
  expect(changed).not.toHaveBeenCalled()
})
