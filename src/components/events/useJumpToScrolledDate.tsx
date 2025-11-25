import { parse } from "date-fns"
import { useEffect, useEffectEvent, useRef } from "react"

export function useJumpToScrolledDate({
  onSetActiveDate,
  datesWithEvents,
  isNavigating,
}: {
  onSetActiveDate: (date: Date) => void
  datesWithEvents: string[]
  isNavigating: () => boolean
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

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

    const observer = new IntersectionObserver((entries) => handleIntersection(entries), {
      root: container,
      rootMargin: "0px 0px -90% 0px", // Only top 10% triggers
      threshold: 0,
    })

    sectionRefs.current.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [datesWithEvents])

  return {
    scrollContainerRef,
    addSectionRef,
    sectionRefs,
  }
}
