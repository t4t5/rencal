import { RefObject, useEffect, useMemo, useRef, useState } from "react"

import { CalendarEvent } from "@/lib/cal-events"
import { formatDateKey } from "@/lib/event-time"

export type Section = {
  date: Date
  events: CalendarEvent[]
  isGhost: boolean
}

// A "ghost section" is an empty placeholder for a date with no events.
// It's shown when the user navigates to such a date so there's something to scroll to,
// and it disappears once the user scrolls it out of view.
export function useGhostSection({
  eventsByDate,
  scrollContainerRef,
}: {
  eventsByDate: { date: Date; events: CalendarEvent[] }[]
  scrollContainerRef: RefObject<HTMLDivElement | null>
}) {
  const [ghostDate, setGhostDate] = useState<Date | null>(null)
  const ghostDateRef = useRef<Date | null>(null)
  ghostDateRef.current = ghostDate
  const ghostRef = useRef<HTMLDivElement>(null)
  const ghostScrollBehaviorRef = useRef<ScrollBehavior>("smooth")

  const sectionsToRender = useMemo((): Section[] => {
    const sections: Section[] = eventsByDate.map(({ date, events }) => ({
      date,
      events,
      isGhost: false,
    }))

    if (ghostDate) {
      const ghostDateStr = formatDateKey(ghostDate)
      const alreadyExists = sections.some(({ date }) => formatDateKey(date) === ghostDateStr)
      if (!alreadyExists) {
        sections.push({ date: ghostDate, events: [], isGhost: true })
        sections.sort((a, b) => a.date.getTime() - b.date.getTime())
      }
    }

    return sections
  }, [eventsByDate, ghostDate])

  // Scroll to ghost section after it renders, and remove it once it leaves the viewport:
  useEffect(() => {
    if (!ghostDate || !ghostRef.current || !scrollContainerRef.current) return

    const el = ghostRef.current
    el.scrollIntoView({ behavior: ghostScrollBehaviorRef.current, block: "start" })

    let hasBeenVisible = false
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          hasBeenVisible = true
        } else if (hasBeenVisible) {
          setGhostDate(null)
        }
      },
      { root: scrollContainerRef.current, threshold: 0 },
    )
    observer.observe(el)

    return () => observer.disconnect()
  }, [ghostDate])

  const showGhost = (date: Date, behavior: ScrollBehavior) => {
    ghostScrollBehaviorRef.current = behavior
    setGhostDate(date)
  }

  const clearGhost = () => setGhostDate(null)

  return {
    sectionsToRender,
    ghostRef,
    ghostDateRef,
    showGhost,
    clearGhost,
  }
}
