// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"

import { fitPopoverAnchor } from "@/lib/event-anchor"

describe("fitPopoverAnchor", () => {
  it("keeps anchors the popover fits beside", () => {
    const rect = new DOMRect(100, 50, 150, 0)
    expect(fitPopoverAnchor(rect, 1000)).toBe(rect)
  })

  it("keeps wide anchors with room on the left", () => {
    const rect = new DOMRect(500, 50, 450, 0)
    expect(fitPopoverAnchor(rect, 1000)).toBe(rect)
  })

  it("collapses anchors with no room on either side", () => {
    // Mon–Fri bar in a ~925px window
    const rect = new DOMRect(272, 50, 463, 0)
    const fitted = fitPopoverAnchor(rect, 925)
    expect(fitted.width).toBe(0)
    expect(fitted.top).toBe(50)
    expect(fitted.left).toBe(925 - 8 - 350 - 16)
  })

  it("keeps the collapsed anchor within the original rect", () => {
    const rect = new DOMRect(100, 50, 100, 0)
    expect(fitPopoverAnchor(rect, 400).left).toBe(100)
  })
})
