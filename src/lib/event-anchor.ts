import type { MouseEvent } from "react"

type EventAnchor = { getBoundingClientRect: () => DOMRect }

let _anchor: EventAnchor | null = null

export const setEventAnchor = (anchor: EventAnchor | null) => {
  _anchor = anchor
}

export const getEventAnchor = () => _anchor

// Events that fill the whole row (>= 1 week long) push the popover
// off-screen, so we anchor them at the clicking point
export const pointAnchorFromClick = (e: MouseEvent<HTMLElement>): EventAnchor => {
  const { top, height } = e.currentTarget.getBoundingClientRect()
  const x = e.clientX
  return {
    getBoundingClientRect: () => new DOMRect(x, top, 0, height),
  }
}

export const EVENT_POPOVER_WIDTH = 350
export const EVENT_POPOVER_GAP = 8
export const EVENT_POPOVER_PADDING = 16

// Anchors too wide for the popover to fit on either side (e.g. multi-day
// events) push it off-screen, so collapse them to a point it fits next to
export const fitPopoverAnchor = (rect: DOMRect, viewportWidth = window.innerWidth): DOMRect => {
  const needed = EVENT_POPOVER_GAP + EVENT_POPOVER_WIDTH + EVENT_POPOVER_PADDING
  const fitsRight = rect.right + needed <= viewportWidth
  const fitsLeft = rect.left - needed >= 0
  if (fitsRight || fitsLeft) return rect

  const x = Math.min(Math.max(viewportWidth - needed, rect.left), rect.right)
  return new DOMRect(x, rect.top, 0, rect.height)
}
