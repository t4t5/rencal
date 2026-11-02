// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"

import { fitPopoverAnchor } from "@/lib/event-anchor"

describe("fitPopoverAnchor", () => {
  it("keeps anchors the popover fits beside", () => {
    const rect = new DOMRect(100, 50, 150, 0)
    expect(fitPopoverAnchor(rect, { viewportWidth: 1000 })).toBe(rect)
  })

  it("keeps wide anchors with room on the left", () => {
    const rect = new DOMRect(500, 50, 450, 0)
    expect(fitPopoverAnchor(rect, { viewportWidth: 1000 })).toBe(rect)
  })

  it("collapses anchors with no room on either side", () => {
    // Mon–Fri bar in a ~925px window
    const rect = new DOMRect(272, 50, 463, 0)
    const fitted = fitPopoverAnchor(rect, { viewportWidth: 925 })
    expect(fitted.width).toBe(0)
    expect(fitted.top).toBe(50)
    expect(fitted.left).toBe(925 - 8 - 350 - 16)
  })

  it("keeps the collapsed anchor within the original rect", () => {
    const rect = new DOMRect(100, 50, 100, 0)
    expect(fitPopoverAnchor(rect, { viewportWidth: 400 }).left).toBe(100)
  })

  it("collapses anchors wider than the popover to the click", () => {
    const rect = new DOMRect(300, 50, 1400, 20)
    const fitted = fitPopoverAnchor(rect, { pointerX: 900, viewportWidth: 1800 })
    expect(fitted.left).toBe(900)
    expect(fitted.width).toBe(0)
    expect(fitted.height).toBe(20)
  })

  it("keeps anchors no wider than the popover beside the element when clicked", () => {
    const rect = new DOMRect(300, 50, 200, 20)
    expect(fitPopoverAnchor(rect, { pointerX: 400, viewportWidth: 1800 })).toBe(rect)
  })

  it("moves a click with no room on either side to where the popover fits", () => {
    const rect = new DOMRect(0, 50, 500, 20)
    expect(fitPopoverAnchor(rect, { pointerX: 300, viewportWidth: 500 }).left).toBe(500 - 374)
  })
})
