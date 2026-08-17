import { useEffect, useEffectEvent, useRef } from "react"

import type { CalendarEvent } from "@/lib/cal-events"
import { createDebugLogger } from "@/lib/debug"
import { formatDateKey, getLocalTzid, subscribeLocalTzid } from "@/lib/event-time"

const debug = createDebugLogger("agenda")

type RegroupReason = "group" | "timezone"

type PendingScroll = {
  date: Date
  previousEvents: CalendarEvent[]
  reason: RegroupReason
}

// Group and timezone changes can both replace the Agenda's day sections. Keep
// the date at the top of the viewport anchored while that replacement renders.
export function usePreserveActiveDateOnRegroup({
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
  const pendingScrollRef = useRef<PendingScroll | null>(null)

  const beginPreserving = useEffectEvent((reason: RegroupReason) => {
    debug("preserve active date before regroup", {
      reason,
      activeDate: formatDateKey(activeDate),
      tzid: getLocalTzid(),
    })
    pendingScrollRef.current = { date: activeDate, previousEvents: events, reason }
    setIsNavigating(true)
  })

  useEffect(() => {
    if (previousActiveGroupRef.current === activeGroup) return

    debug("active group changed", {
      previousGroup: previousActiveGroupRef.current,
      activeGroup,
    })
    previousActiveGroupRef.current = activeGroup
    beginPreserving("group")
  }, [activeGroup])

  // Subscribe directly rather than reacting to useLocalTzid after render. This
  // captures activeDate and the old event array before CalEventsContext replaces
  // every event's viewer-zone projection in the same notification cycle.
  useEffect(() => subscribeLocalTzid(() => beginPreserving("timezone")), [])

  useEffect(() => {
    const pending = pendingScrollRef.current
    if (!pending) return
    if (events === pending.previousEvents) return
    if (isInitialLoading || isLoadingCalendars) return

    if (events.length === 0) {
      debug("regroup left no events to scroll", {
        reason: pending.reason,
        activeDate: formatDateKey(pending.date),
      })
      setIsNavigating(false)
      pendingScrollRef.current = null
      return
    }

    requestAnimationFrame(() => {
      // A second regroup may have superseded this one before the frame ran.
      if (pendingScrollRef.current !== pending) return

      debug("scroll to preserved active date after regroup", {
        reason: pending.reason,
        activeDate: formatDateKey(pending.date),
      })
      scrollToDate(pending.date, "instant")
      setIsNavigating(false)
      pendingScrollRef.current = null
    })
  }, [events, isInitialLoading, isLoadingCalendars, scrollToDate, setIsNavigating])
}
