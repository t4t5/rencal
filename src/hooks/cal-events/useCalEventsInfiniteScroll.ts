import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns"
import { RefObject, useCallback, useRef } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"

import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { getCalendarEventsForRange, MONTHS_TO_LOAD } from "@/lib/cal-events-range"

export const useCalEventsInfiniteScroll = ({
  scrollContainerRef,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
}) => {
  const { calendars } = useCalendars()
  const { currentDateRangeRef, setCalendarEvents } = useCalEvents()
  const isLoadingRef = useRef(false)

  // TODO: respect calendar visibility
  const visibleCalendarIds = calendars.map((c) => c.slug)
  // const visibleCalendarIds = calendars.filter((c) => c.isVisible).map((c) => c.id)

  const onNearTop = useCallback(async () => {
    if (isLoadingRef.current) return
    const currentRange = currentDateRangeRef.current
    if (!currentRange) return

    isLoadingRef.current = true

    try {
      // Load events for prev range and prepend them:
      const prevStart = startOfMonth(subMonths(currentRange.start, MONTHS_TO_LOAD))
      const prevRange = { start: prevStart, end: currentRange.start }
      const prevEvents = await getCalendarEventsForRange(
        visibleCalendarIds,
        prevRange.start,
        prevRange.end,
      )

      setCalendarEvents((prev) => {
        const existingIds = new Set(prev.map((e) => e.id))
        const newEvents = prevEvents.filter((e) => !existingIds.has(e.id))

        if (newEvents.length) {
          return [...newEvents, ...prev]
        } else {
          return prev
        }
      })

      // Scroll position preservation is handled by EventList's useLayoutEffect

      currentDateRangeRef.current = {
        start: prevStart,
        end: currentRange.end,
      }
    } finally {
      isLoadingRef.current = false
    }
  }, [visibleCalendarIds])

  const onNearBottom = useCallback(async () => {
    if (isLoadingRef.current) return
    const currentRange = currentDateRangeRef.current
    if (!currentRange) return

    isLoadingRef.current = true

    try {
      // Load events for next range and append them:
      const nextEnd = endOfMonth(addMonths(currentRange.end, MONTHS_TO_LOAD))
      const nextRange = { start: currentRange.end, end: nextEnd }
      const nextEvents = await getCalendarEventsForRange(
        visibleCalendarIds,
        nextRange.start,
        nextRange.end,
      )

      setCalendarEvents((prev) => {
        const existingIds = new Set(prev.map((e) => e.id))
        const newEvents = nextEvents.filter((e) => !existingIds.has(e.id))

        if (newEvents.length) {
          return [...prev, ...newEvents]
        } else {
          return prev
        }
      })

      currentDateRangeRef.current = {
        start: currentRange.start,
        end: nextEnd,
      }
    } finally {
      isLoadingRef.current = false
    }
  }, [visibleCalendarIds])

  useScrollBoundary({
    scrollContainerRef,
    threshold: 200,
    onNearTop,
    onNearBottom,
  })
}
