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
  const containerRect = container.getBoundingClientRect()
  const sectionRect = section.getBoundingClientRect()
  const top = sectionRect.top - containerRect.top + container.scrollTop
  debug("scrollSectionIntoContainer", {
    behavior,
    fromScrollTop: container.scrollTop,
    toTop: top,
    containerTop: containerRect.top,
    sectionTop: sectionRect.top,
    containerHeight: container.clientHeight,
    scrollHeight: container.scrollHeight,
  })
  container.scrollTo({ top, behavior })
}
