// @vitest-environment happy-dom
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { Combobox } from "./combo-box"
import { CommandGroup, CommandItem } from "./command"

let root: Root
const onPick = vi.fn()

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  onPick.mockReset()
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

const Fruit = () => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  return (
    <Combobox addon={null} query={query} setQuery={setQuery} open={open} setOpen={setOpen}>
      <CommandGroup>
        {["apple", "banana", "cherry"].map((fruit) => (
          <CommandItem
            key={fruit}
            value={fruit}
            onSelect={() => {
              onPick(fruit)
              setOpen(false)
            }}
          >
            {fruit}
          </CommandItem>
        ))}
      </CommandGroup>
    </Combobox>
  )
}

const input = () => document.querySelector<HTMLInputElement>("[data-slot=combobox-input]")!

const selected = () =>
  document.querySelector<HTMLElement>("[data-slot=command-item][data-selected=true]")?.textContent

const press = async (key: string) => {
  await act(async () => {
    input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
  })
}

const render = async () => {
  await act(async () => root.render(<Fruit />))
  await act(async () => input().focus())
}

it("moves the highlight with the arrow keys while focus stays in the input", async () => {
  await render()
  expect(selected()).toBe("apple")

  await press("ArrowDown")
  await press("ArrowDown")
  expect(selected()).toBe("cherry")

  await press("ArrowUp")
  expect(selected()).toBe("banana")
  expect(document.activeElement).toBe(input())
})

it("picks the highlighted option on Enter", async () => {
  await render()
  await press("ArrowDown")
  await press("Enter")

  expect(onPick).toHaveBeenCalledWith("banana")
})

it("reopens the list on an arrow key after it was closed", async () => {
  await render()
  await press("Enter")
  expect(selected()).toBeUndefined()

  await press("ArrowDown")
  expect(selected()).toBeDefined()
})

it("leaves Home/End to the input's caret", async () => {
  await render()
  await press("ArrowDown")
  await press("End")

  expect(selected()).toBe("banana")
})
