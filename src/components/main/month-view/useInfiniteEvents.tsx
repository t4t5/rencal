import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns"
import { useCallback, useEffect, useRef, useState } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { CalendarEvent } from "@/lib/cal-events"
import { getCalendarEventsForRange, MONTHS_TO_LOAD } from "@/lib/cal-events-range"

function mergeEvents(
  prev: CalendarEvent[],
  incoming: CalendarEvent[],
  position: "append" | "prepend",
): CalendarEvent[] {
  const existingIds = new Set(prev.map((e) => e.id))
  const filtered = incoming.filter((e) => !existingIds.has(e.id))
  if (!filtered.length) return prev
  return position === "append" ? [...prev, ...filtered] : [...filtered, ...prev]
}

// Extends the month grid and loads events when scrolling past edges or when
// activeDate jumps outside the loaded range (e.g. typing "on july 5").
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

  const isLoadingRef = useRef(false)

  const extendForward = useCallback(
    async (newEnd: Date) => {
      if (isLoadingRef.current) return
      isLoadingRef.current = true
      try {
        const cur = currentDateRangeRef.current
        if (!cur || newEnd <= cur.end) return
        setRangeEnd(startOfMonth(addMonths(newEnd, 1)))
        const events = await getCalendarEventsForRange(visibleCalendarIds, cur.end, newEnd)
        setCalendarEvents((prev) => mergeEvents(prev, events, "append"))
        currentDateRangeRef.current = { start: cur.start, end: newEnd }
      } finally {
        isLoadingRef.current = false
      }
    },
    [visibleCalendarIds, setCalendarEvents, currentDateRangeRef],
  )

  const extendBackward = useCallback(
    async (newStart: Date) => {
      if (isLoadingRef.current) return
      isLoadingRef.current = true
      try {
        const cur = currentDateRangeRef.current
        if (!cur || newStart >= cur.start) return
        // Load events BEFORE extending the grid so they're already available
        // when the new rows render (scroll adjustment makes them instantly visible).
        const events = await getCalendarEventsForRange(visibleCalendarIds, newStart, cur.start)
        setCalendarEvents((prev) => mergeEvents(prev, events, "prepend"))
        currentDateRangeRef.current = { start: newStart, end: cur.end }
        setRangeStart(newStart)
      } finally {
        isLoadingRef.current = false
      }
    },
    [visibleCalendarIds, setCalendarEvents, currentDateRangeRef],
  )

  // Jump-navigation: activeDate moved outside the loaded range.
  const visibleCalendarKey = visibleCalendarIds.join("|")
  useEffect(() => {
    const cur = currentDateRangeRef.current
    if (!cur) return
    if (activeDate >= cur.end) {
      void extendForward(endOfMonth(addMonths(activeDate, MONTHS_TO_LOAD)))
    } else if (activeDate < cur.start) {
      void extendBackward(startOfMonth(subMonths(activeDate, MONTHS_TO_LOAD)))
    }
  }, [activeDate, visibleCalendarKey, currentDateRangeRef, extendForward, extendBackward])

  useScrollBoundary({
    scrollContainerRef,
    threshold: 200,
    onNearTop: useCallback(() => {
      const cur = currentDateRangeRef.current
      if (!cur) return
      void extendBackward(startOfMonth(subMonths(cur.start, MONTHS_TO_LOAD)))
    }, [currentDateRangeRef, extendBackward]),
    onNearBottom: useCallback(() => {
      const cur = currentDateRangeRef.current
      if (!cur) return
      void extendForward(endOfMonth(addMonths(cur.end, MONTHS_TO_LOAD)))
    }, [currentDateRangeRef, extendForward]),
  })

  return { rangeStart, rangeEnd }
}
