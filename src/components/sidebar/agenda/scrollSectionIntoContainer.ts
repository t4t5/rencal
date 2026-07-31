import { createDebugLogger } from "@/lib/debug"

const debug = createDebugLogger("agenda")

// Scroll the given container so `section`'s top aligns with the container's top.
// Avoids `Element.scrollIntoView`, which walks up all scroll-containers (including
// the Sidebar's `overflow-hidden` wrapper) and can scroll ancestors we don't want
// to move.
export function scrollSectionIntoContainer(
  container: HTMLElement,
  section: HTMLElement,
  behavior: ScrollBehavior,
) {
  scrollElementIntoContainer(container, section, behavior)
}

export function scrollElementIntoContainer(
  container: HTMLElement,
  element: HTMLElement,
  behavior: ScrollBehavior,
  topOffset = 0,
) {
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const top = elementRect.top - containerRect.top + container.scrollTop - topOffset
  debug("scrollElementIntoContainer", {
    behavior,
    topOffset,
    fromScrollTop: container.scrollTop,
    toTop: top,
    containerTop: containerRect.top,
    elementTop: elementRect.top,
    containerHeight: container.clientHeight,
    scrollHeight: container.scrollHeight,
  })
  container.scrollTo({ top, behavior })
}
