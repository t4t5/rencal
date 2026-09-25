// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { ReminderSelect } from "./ReminderSelect"

let root: Root
const onSelect = vi.fn()

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  onSelect.mockReset()
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

const input = () => document.querySelector<HTMLInputElement>("[data-slot=combobox-input]")!

const press = async (key: string) => {
  await act(async () => {
    input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
  })
}

const render = async () => {
  await act(async () =>
    root.render(<ReminderSelect reminders={[]} onSelect={onSelect} onRemove={vi.fn()} />),
  )
  await act(async () => input().focus())
}

it("adds the reminder reached with the arrow keys", async () => {
  await render()
  await press("ArrowDown")
  await press("Enter")

  expect(onSelect).toHaveBeenCalledWith(10)
})

it("adds the first match for a typed duration on Enter", async () => {
  await render()
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    setValue.call(input(), "2h")
    input().dispatchEvent(new Event("input", { bubbles: true }))
  })
  await press("Enter")

  expect(onSelect).toHaveBeenCalledWith(120)
})
