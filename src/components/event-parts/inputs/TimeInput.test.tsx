// @vitest-environment happy-dom
import { Temporal } from "@js-temporal/polyfill"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { EventTime } from "@/lib/event-time"

import { TimeInput } from "./TimeInput"

vi.mock("@/contexts/SettingsContext", () => ({ useSettings: () => ({ timeFormat: "24h" }) }))

let root: Root
const onChange = vi.fn()

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  onChange.mockReset()
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

const at = (hour: number, minute: number): EventTime => ({
  kind: "datetime_floating",
  value: Temporal.PlainDateTime.from({ year: 2026, month: 9, day: 25, hour, minute }),
})

const input = () => document.querySelector<HTMLInputElement>("[data-slot=combobox-input]")!

const press = async (key: string) => {
  await act(async () => {
    input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
  })
}

const type = async (text: string) => {
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    setValue.call(input(), text)
    input().dispatchEvent(new Event("input", { bubbles: true }))
  })
}

const render = async (value: EventTime) => {
  await act(async () => root.render(<TimeInput value={value} onChange={onChange} />))
  await act(async () => input().focus())
}

it("commits the row reached with the arrow keys", async () => {
  await render(at(9, 0))
  await press("ArrowDown")
  await press("ArrowDown")
  await press("Enter")

  expect(onChange).toHaveBeenCalledWith(9, 30)
})

it("keeps an off-grid time when Enter is pressed untouched", async () => {
  await render(at(9, 7))
  await press("Enter")

  expect(onChange).not.toHaveBeenCalled()
  expect(document.querySelector("[data-slot=command-item]")).toBeNull()
})

it("commits a typed off-grid time exactly", async () => {
  await render(at(9, 0))
  await type("14:07")
  await press("Enter")

  expect(onChange).toHaveBeenCalledWith(14, 7)
})

it("commits the row reached with the arrow keys after typing", async () => {
  await render(at(9, 0))
  await type("14")
  await press("ArrowDown")
  await press("Enter")

  expect(onChange).toHaveBeenCalledWith(14, 15)
})
