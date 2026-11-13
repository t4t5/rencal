// @vitest-environment happy-dom
import { act, useRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { useVisibleHours } from "./useVisibleHours"

let root: Root
let viewportHeight: number
let headerHeight: number
let resize: () => void
let clampScroll: boolean

function Grid({ hours }: { hours: { start_hour: number; end_hour: number } | null }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const height = useVisibleHours(scrollRef, headerRef, hours)
  return (
    <div ref={scrollRef} data-testid="scroll">
      <div ref={headerRef} data-testid="header" />
      <div
        data-testid="grid"
        style={{ height: 24 * height }}
        ref={() => {
          // Simulate the browser clamping scrollTop when a shorter grid commits.
          if (clampScroll && scrollRef.current) {
            scrollRef.current.scrollTop = Math.min(
              scrollRef.current.scrollTop,
              24 * height - (viewportHeight - headerHeight),
            )
          }
        }}
      />
    </div>
  )
}

const scroll = () => document.querySelector<HTMLDivElement>('[data-testid="scroll"]')!
const height = () =>
  parseFloat(document.querySelector<HTMLElement>('[data-testid="grid"]')!.style.height)

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  viewportHeight = 650
  headerHeight = 50
  clampScroll = false
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => viewportHeight)
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => headerHeight)
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe() {}
      disconnect() {}
    },
  )
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

async function render(start: number | null, end = 20) {
  await act(async () =>
    root.render(<Grid hours={start === null ? null : { start_hour: start, end_hour: end }} />),
  )
}

it("fits the preferred range below the sticky header and keeps the full day", async () => {
  await render(8)
  expect(height()).toBe(1200)
  expect(scroll().scrollTop).toBe(400)
  expect(((20 - 8) * height()) / 24).toBe(viewportHeight - headerHeight)
})

it("does not reset a user's vertical scroll on rerender or equivalent settings reload", async () => {
  await render(8)
  scroll().scrollTop = 50 // 01:00, outside the preferred range
  await render(8)
  expect(scroll().scrollTop).toBe(50)
})

it("preserves the visible hour on window and all-day header resizing", async () => {
  await render(8)
  scroll().scrollTop = 10 * 50
  viewportHeight = 770
  await act(async () => resize())
  expect(height()).toBe(1440)
  expect(scroll().scrollTop).toBe(600)
  headerHeight = 170
  await act(async () => resize())
  expect(height()).toBe(1200)
  expect(scroll().scrollTop).toBe(500)
})

it("realigns to the start only when the preferred range changes", async () => {
  await render(8)
  scroll().scrollTop = 50
  await render(10, 22)
  expect(scroll().scrollTop).toBe(500)
  await render(10, 20)
  expect(height()).toBe(1440)
  expect(scroll().scrollTop).toBe(600)
})

it("preserves the hour near the bottom when a smaller grid clamps the old scroll offset", async () => {
  await render(8)
  scroll().scrollTop = 600 // Noon, with midnight at the bottom of the viewport.
  clampScroll = true
  viewportHeight = 410
  await act(async () => resize())
  expect(height()).toBe(720)
  expect(scroll().scrollTop).toBe(360)
})

it("supports midnight at either end and a full-day range", async () => {
  await render(0, 24)
  expect(height()).toBe(600)
  expect(scroll().scrollTop).toBe(0)
  await render(23, 24)
  expect(height()).toBe(14400)
  expect(scroll().scrollTop).toBe(13800)
})

it("keeps the original scale and initial scroll when disabled", async () => {
  await render(null)
  expect(height()).toBe(24 * 48)
  scroll().scrollTop = 350
  viewportHeight = 800
  await act(async () => resize())
  expect(scroll().scrollTop).toBe(350)
})

it("restores the original scale while preserving the hour when disabled", async () => {
  await render(8)
  scroll().scrollTop = 500
  await render(null)
  expect(height()).toBe(24 * 48)
  expect(scroll().scrollTop).toBe(480)
  await render(8)
  expect(scroll().scrollTop).toBe(400)
})

it("waits for a nonzero viewport before positioning", async () => {
  viewportHeight = 0
  await render(8)
  expect(scroll().scrollTop).toBe(0)
  viewportHeight = 650
  await act(async () => resize())
  expect(height()).toBe(1200)
  expect(scroll().scrollTop).toBe(400)
})

it.each([
  [8, 8],
  [20, 8],
  [-1, 20],
  [8, 25],
])("ignores an invalid range %s–%s", async (start, end) => {
  await render(start, end)
  expect(height()).toBe(24 * 48)
  expect(scroll().scrollTop).toBe(0)
})
