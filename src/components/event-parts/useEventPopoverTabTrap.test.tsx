// @vitest-environment happy-dom
import { act, type ReactNode, useRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { useEventPopoverTabTrap } from "./useEventPopoverTabTrap"

let root: Root

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  // happy-dom doesn't lay out, so treat every element as rendered.
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([new DOMRect()] as never)
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

const Popover = ({ children }: { children: ReactNode }) => {
  const contentRef = useRef<HTMLDivElement>(null)
  useEventPopoverTabTrap({ enabled: true, contentRef })

  return (
    <div ref={contentRef} tabIndex={-1}>
      {children}
    </div>
  )
}

const editableFields = (
  <>
    <button id="more">…</button>
    <textarea id="title" data-popover-entry />
    <textarea id="location" />
    <input id="locked-time" readOnly tabIndex={-1} />
    <button id="zone-switch" />
  </>
)

const el = (id: string) => document.getElementById(id)!

const tab = (shiftKey = false) => {
  const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, cancelable: true })
  window.dispatchEvent(event)
  return event
}

const render = (fields = editableFields) =>
  act(async () => root.render(<Popover>{fields}</Popover>))

it("enters at the title", async () => {
  await render()

  expect(tab().defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(el("title"))
})

it("enters a read-only event at its primary action", async () => {
  await render(
    <>
      <button id="zone-switch" />
      <textarea id="title" readOnly tabIndex={-1} data-popover-entry />
      <button id="join" data-popover-entry />
      <input id="reminders" />
    </>,
  )
  tab()

  expect(document.activeElement).toBe(el("join"))
})

it("lets the browser move between stops", async () => {
  await render()
  el("location").focus()

  expect(tab().defaultPrevented).toBe(false)
})

it("continues from a focused non-stop instead of re-entering at the title", async () => {
  await render()
  el("locked-time").focus()

  expect(tab().defaultPrevented).toBe(false)
  expect(document.activeElement).toBe(el("locked-time"))
})

it("wraps at the edges", async () => {
  await render()
  el("zone-switch").focus()
  tab()
  expect(document.activeElement).toBe(el("more"))

  tab(true)
  expect(document.activeElement).toBe(el("zone-switch"))
})
