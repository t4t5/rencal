import { parse } from "date-fns"
import { RefObject, useEffect, useEffectEvent, useRef } from "react"

export function useJumpToScrolledDate({
  onSetActiveDate,
  datesWithEvents,
  isNavigating,
  scrollContainerRef,
}: {
  onSetActiveDate: (date: Date) => void
  datesWithEvents: string[]
  isNavigating: () => boolean
  scrollContainerRef: RefObject<HTMLDivElement | null>
}) {
  const sectionRefs = useRef(new Map<string, HTMLDivElement>())
  const lastContainerSizeRef = useRef<{ w: number; h: number } | null>(null)

  const addSectionRef = (dateStr: string, el: HTMLDivElement) => {
    sectionRefs.current.set(dateStr, el)
  }

  const handleIntersection = useEffectEvent((entries: IntersectionObserverEntry[]) => {
    // Skip if we're currently doing a programmatic navigation
    if (isNavigating()) return

    // Skip if the container has resized since the last callback. Resizing the
    // window shifts sections in/out of the rootMargin trigger zone purely from
    // layout — without this guard, activeDate would jump to whichever section
    // ends up near the top of the new viewport.
    const container = scrollContainerRef.current
    if (container) {
      const size = { w: container.clientWidth, h: container.clientHeight }
      const lastSize = lastContainerSizeRef.current
      lastContainerSizeRef.current = size
      if (lastSize && (lastSize.w !== size.w || lastSize.h !== size.h)) return
    }

    for (const entry of entries) {
      if (entry.isIntersecting) {
        const dateStr = entry.target.getAttribute("data-date")
        if (dateStr) {
          onSetActiveDate(parse(dateStr, "yyyy-MM-dd", new Date()))
        }
      }
    }
  })

  useEffect(() => {
    const container = scrollContainerRef.current

    if (!container) return

    // Seed the size baseline so the first non-skipped callback can detect a
    // resize that happened between mount and now.
    lastContainerSizeRef.current = {
      w: container.clientWidth,
      h: container.clientHeight,
    }

    // Skip the initial batch of callbacks that IntersectionObserver fires
    // when it first observes elements. Without this, re-creating the observer
    // (e.g. after sync adds new events) would immediately set activeDate to
    // whatever section happens to be at the top of the viewport.
    let skipInitial = true

    const observer = new IntersectionObserver(
      (entries) => {
        if (skipInitial) {
          skipInitial = false
          return
        }
        handleIntersection(entries)
      },
      {
        root: container,
        rootMargin: "0px 0px -90% 0px", // Only top 10% triggers
        threshold: 0,
      },
    )

    sectionRefs.current.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [datesWithEvents])

  return {
    addSectionRef,
    sectionRefs,
  }
}
