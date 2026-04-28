import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns"
import { useCallback, useEffect, useRef, useState } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { getCalendarEventsForRange, MONTHS_TO_LOAD } from "@/lib/cal-events-range"

// Extends the month grid and loads more events when the user scrolls near the top or bottom.
export function useInfiniteEvents({
  scrollContainerRef,
  activeDate,
  visibleCalendarIds,
}: {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  activeDate: Date
  visibleCalendarIds: string[]
}) {
  const { setCalendarEvents, currentDateRangeRef } = useCalEvents()

  const [rangeStart, setRangeStart] = useState(() => startOfMonth(subMonths(activeDate, 2)))
  const [rangeEnd, setRangeEnd] = useState(() => startOfMonth(addMonths(activeDate, 3)))

  // When navigation jumps activeDate outside the loaded range (e.g. typing
  // "on july 5" while the grid stops at July 1), extend the range so the
  // scroll-to-active-week effect can find the target.
  useEffect(() => {
    if (activeDate >= rangeEnd) {
      setRangeEnd(startOfMonth(addMonths(activeDate, 2)))
    } else if (activeDate < rangeStart) {
      setRangeStart(startOfMonth(subMonths(activeDate, 2)))
    }
  }, [activeDate, rangeStart, rangeEnd])

  const isLoadingRef = useRef(false)

  useScrollBoundary({
    scrollContainerRef,
    threshold: 200,
    onNearTop: useCallback(async () => {
      if (isLoadingRef.current) return
      isLoadingRef.current = true

      try {
        // Load events BEFORE extending the grid so they're already available
        // when the new rows render (scroll adjustment makes them instantly visible)
        const currentRange = currentDateRangeRef.current
        if (!currentRange) return
        const prevStart = startOfMonth(subMonths(currentRange.start, MONTHS_TO_LOAD))
        const prevEvents = await getCalendarEventsForRange(
          visibleCalendarIds,
          prevStart,
          currentRange.start,
        )
        setCalendarEvents((prev) => {
          const existingIds = new Set(prev.map((e) => e.id))
          const newEvents = prevEvents.filter((e) => !existingIds.has(e.id))
          return newEvents.length ? [...newEvents, ...prev] : prev
        })
        currentDateRangeRef.current = { start: prevStart, end: currentRange.end }

        setRangeStart((prev) => startOfMonth(subMonths(prev, 2)))
      } finally {
        isLoadingRef.current = false
      }
    }, [visibleCalendarIds, setCalendarEvents, currentDateRangeRef]),
    onNearBottom: useCallback(async () => {
      if (isLoadingRef.current) return
      isLoadingRef.current = true

      try {
        setRangeEnd((prev) => startOfMonth(addMonths(prev, 2)))

        const currentRange = currentDateRangeRef.current
        if (!currentRange) return
        const nextEnd = endOfMonth(addMonths(currentRange.end, MONTHS_TO_LOAD))
        const nextEvents = await getCalendarEventsForRange(
          visibleCalendarIds,
          currentRange.end,
          nextEnd,
        )
        setCalendarEvents((prev) => {
          const existingIds = new Set(prev.map((e) => e.id))
          const newEvents = nextEvents.filter((e) => !existingIds.has(e.id))
          return newEvents.length ? [...prev, ...newEvents] : prev
        })
        currentDateRangeRef.current = { start: currentRange.start, end: nextEnd }
      } finally {
        isLoadingRef.current = false
      }
    }, [visibleCalendarIds, setCalendarEvents, currentDateRangeRef]),
  })

  return { rangeStart, rangeEnd }
}
