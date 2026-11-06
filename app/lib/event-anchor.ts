import type { Bounds } from "nsh"

export const EVENT_POPOVER_WIDTH = 350
export const EVENT_POPOVER_GAP = 8
export const EVENT_POPOVER_PADDING = 16

/**
 * Where the popover goes for an anchor at `bounds`. Anchors wider than the
 * popover, like an event spanning a week, collapse to the press so it opens
 * where the user looked; anchors with no room on either side collapse to a
 * point it fits next to.
 */
export function fitPopoverAnchor(
  bounds: Bounds,
  { pointerX, viewportWidth }: { pointerX?: number; viewportWidth: number },
): Bounds {
  const left = bounds.origin.x
  const right = left + bounds.size.width
  const point = (x: number): Bounds => ({
    origin: { x: Math.min(Math.max(x, left), right), y: bounds.origin.y },
    size: { width: 0, height: bounds.size.height },
  })
  const anchor =
    pointerX !== undefined && bounds.size.width > EVENT_POPOVER_WIDTH ? point(pointerX) : bounds

  const needed = EVENT_POPOVER_GAP + EVENT_POPOVER_WIDTH + EVENT_POPOVER_PADDING
  const fitsRight = anchor.origin.x + anchor.size.width + needed <= viewportWidth
  const fitsLeft = anchor.origin.x - needed >= 0
  if (fitsRight || fitsLeft) return anchor

  return point(Math.min(Math.max(viewportWidth - needed, left), right))
}
