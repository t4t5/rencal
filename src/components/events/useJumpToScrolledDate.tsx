import { parse } from "date-fns"
import { useEffect, useRef } from "react"

export function useJumpToScrolledDate({
  onSetActiveDate,
  datesWithEvents,
}: {
  onSetActiveDate: (date: Date) => void
  datesWithEvents: string[]
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const sectionRefs = useRef(new Map<string, HTMLDivElement>())

  const addSectionRef = (dateStr: string, el: HTMLDivElement) => {
    sectionRefs.current.set(dateStr, el)
  }

  useEffect(() => {
    const container = scrollContainerRef.current

    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const dateStr = entry.target.getAttribute("data-date")
            if (dateStr) {
              onSetActiveDate(parse(dateStr, "yyyy-MM-dd", new Date()))
            }
          }
        }
      },
      {
        root: container,
        rootMargin: "0px 0px -90% 0px", // Only top 10% triggers
        threshold: 0,
      },
    )

    sectionRefs.current.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [onSetActiveDate, datesWithEvents])

  return {
    scrollContainerRef,
    addSectionRef,
  }
}
