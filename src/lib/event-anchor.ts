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
