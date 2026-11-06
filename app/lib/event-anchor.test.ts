import { fitPopoverAnchor } from "@/lib/event-anchor"
import { describe, expect, it } from "@/lib/testing/vitest"

const rect = (x: number, y: number, width: number, height: number) => ({
  origin: { x, y },
  size: { width, height },
})

describe("fitPopoverAnchor", () => {
  it("keeps anchors the popover fits beside", () => {
    const bounds = rect(100, 50, 150, 0)
    expect(fitPopoverAnchor(bounds, { viewportWidth: 1000 })).toBe(bounds)
  })

  it("keeps wide anchors with room on the left", () => {
    const bounds = rect(500, 50, 450, 0)
    expect(fitPopoverAnchor(bounds, { viewportWidth: 1000 })).toBe(bounds)
  })

  it("collapses anchors with no room on either side", () => {
    const fitted = fitPopoverAnchor(rect(272, 50, 463, 0), { viewportWidth: 925 })
    expect(fitted.size.width).toBe(0)
    expect(fitted.origin.y).toBe(50)
    expect(fitted.origin.x).toBe(925 - 8 - 350 - 16)
  })

  it("keeps the collapsed anchor within the original rect", () => {
    expect(fitPopoverAnchor(rect(100, 50, 100, 0), { viewportWidth: 400 }).origin.x).toBe(100)
  })

  it("collapses wide anchors to the press", () => {
    const fitted = fitPopoverAnchor(rect(100, 50, 500, 20), { pointerX: 300, viewportWidth: 2000 })
    expect(fitted.origin.x).toBe(300)
    expect(fitted.size.width).toBe(0)
  })
})
