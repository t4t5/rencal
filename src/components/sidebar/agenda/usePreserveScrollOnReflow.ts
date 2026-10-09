import { RefObject, useEffect } from "react"

import { createDebugLogger } from "@/lib/debug"

const debug = createDebugLogger("agenda")

type Anchor = { el: Element; offset: number; scrollTop: number }

// WebKit has no CSS scroll anchoring, so when the sections reflow without a scroll
// (a theme and its fonts swap in, the sidebar resizes) the same scrollTop lands on
// other days. Keep the topmost visible section where it was instead.
export function usePreserveScrollOnReflow({
  scrollContainerRef,
  enabled,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  enabled: boolean
}) {
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!enabled || !container) return

    let anchor: Anchor | null = null

    const record = () => {
      const top = container.getBoundingClientRect().top
      anchor = null
      for (const el of container.children) {
        const rect = el.getBoundingClientRect()
        // Ignore a sub-pixel sliver of the section above, or its old height gets carried over.
        if (rect.bottom > top + 1) {
          anchor = { el, offset: rect.top - top, scrollTop: container.scrollTop }
          return
        }
      }
    }

    const restore = () => {
      // If scrollTop moved since we last looked, something scrolled on purpose
      // (a jump, the prepend correction): follow it rather than undo it.
      if (anchor?.el.isConnected && container.scrollTop === anchor.scrollTop) {
        const offset = anchor.el.getBoundingClientRect().top - container.getBoundingClientRect().top
        const delta = offset - anchor.offset
        if (Math.abs(delta) >= 1) {
          debug("reflow: keep top section anchored", { delta })
          container.scrollTop += delta
        }
      }
      record()
    }

    const resizeObserver = new ResizeObserver(restore)
    for (const el of container.children) resizeObserver.observe(el)
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) resizeObserver.observe(node)
        }
        for (const node of mutation.removedNodes) {
          if (node instanceof Element) resizeObserver.unobserve(node)
        }
      }
    })
    mutationObserver.observe(container, { childList: true })
    container.addEventListener("scroll", record, { passive: true })
    record()

    return () => {
      container.removeEventListener("scroll", record)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [scrollContainerRef, enabled])
}
