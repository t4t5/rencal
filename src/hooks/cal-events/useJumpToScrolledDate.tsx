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

  const addSectionRef = (dateStr: string, el: HTMLDivElement) => {
    sectionRefs.current.set(dateStr, el)
  }

  const handleIntersection = useEffectEvent((entries: IntersectionObserverEntry[]) => {
    // Skip if we're currently doing a programmatic navigation
    if (isNavigating()) return

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
