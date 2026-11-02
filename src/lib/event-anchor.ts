/**
 * What an event or new-event popover opens beside. `pointerX` is where the
 * click landed on it, for anchors wider than the popover.
 */
export type PopoverAnchor = { getBoundingClientRect: () => DOMRect; pointerX?: number }

let _anchor: PopoverAnchor | null = null

export const setEventAnchor = (anchor: PopoverAnchor | null) => {
  _anchor = anchor
}

export const getEventAnchor = () => _anchor

/** `el`, clicked at `pointerX`. */
export const elementAnchor = (el: Element, pointerX?: number): PopoverAnchor => ({
  getBoundingClientRect: () => el.getBoundingClientRect(),
  pointerX,
})

export const EVENT_POPOVER_WIDTH = 350
export const EVENT_POPOVER_GAP = 8
export const EVENT_POPOVER_PADDING = 16

/**
 * Where the popover goes for an anchor at `rect`. Anchors wider than the
 * popover, like an event spanning a week, collapse to the click so it opens
 * where the user looked; anchors with no room on either side collapse to a
 * point it fits next to.
 */
export const fitPopoverAnchor = (
  rect: DOMRect,
  {
    pointerX,
    viewportWidth = window.innerWidth,
  }: { pointerX?: number; viewportWidth?: number } = {},
): DOMRect => {
  const point = (x: number) =>
    new DOMRect(Math.min(Math.max(x, rect.left), rect.right), rect.top, 0, rect.height)
  const anchor = pointerX !== undefined && rect.width > EVENT_POPOVER_WIDTH ? point(pointerX) : rect

  const needed = EVENT_POPOVER_GAP + EVENT_POPOVER_WIDTH + EVENT_POPOVER_PADDING
  const fitsRight = anchor.right + needed <= viewportWidth
  const fitsLeft = anchor.left - needed >= 0
  if (fitsRight || fitsLeft) return anchor

  return point(Math.min(Math.max(viewportWidth - needed, rect.left), rect.right))
}
