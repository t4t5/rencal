import { useEffect, useRef } from "react"

import type { CalendarEvent } from "@/lib/cal-events"
import { createDebugLogger } from "@/lib/debug"
import { formatDateKey } from "@/lib/event-time"

const debug = createDebugLogger("agenda")

export function usePreserveActiveDateOnGroupChange({
  activeGroup,
  activeDate,
  events,
  isInitialLoading,
  isLoadingCalendars,
  scrollToDate,
  setIsNavigating,
}: {
  activeGroup: string
  activeDate: Date
  events: CalendarEvent[]
  isInitialLoading: boolean
  isLoadingCalendars: boolean
  scrollToDate: (date: Date, behavior: ScrollBehavior) => void
  setIsNavigating: (navigating: boolean) => void
}) {
  const previousActiveGroupRef = useRef(activeGroup)
  const pendingScrollRef = useRef<{ date: Date; previousEvents: CalendarEvent[] } | null>(null)

  useEffect(() => {
    if (previousActiveGroupRef.current === activeGroup) return

    debug("group changed: preserve active date", {
      previousGroup: previousActiveGroupRef.current,
      activeGroup,
      activeDate: formatDateKey(activeDate),
    })
    previousActiveGroupRef.current = activeGroup
    pendingScrollRef.current = { date: activeDate, previousEvents: events }
    setIsNavigating(true)
  }, [activeGroup, activeDate, events, setIsNavigating])

  useEffect(() => {
    const pending = pendingScrollRef.current
    if (!pending) return
    if (events === pending.previousEvents) return
    if (isInitialLoading || isLoadingCalendars) return

    if (events.length === 0) {
      debug("group changed: no events to scroll", {
        activeGroup,
        activeDate: formatDateKey(pending.date),
      })
      setIsNavigating(false)
      pendingScrollRef.current = null
      return
    }

    requestAnimationFrame(() => {
      debug("group changed: scroll to preserved active date", {
        activeGroup,
        activeDate: formatDateKey(pending.date),
      })
      scrollToDate(pending.date, "instant")
      setIsNavigating(false)
      pendingScrollRef.current = null
    })
  }, [activeGroup, events, isInitialLoading, isLoadingCalendars, scrollToDate, setIsNavigating])
}
