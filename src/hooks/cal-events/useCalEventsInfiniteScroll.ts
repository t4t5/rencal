import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns"
import { RefObject, useCallback } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { MONTHS_TO_LOAD } from "@/lib/cal-events-range"

/**
 * Extends the loaded event range as the agenda is scrolled near either end. Fetching,
 * dedup, and single-flight all live in CalEventsContext (ensureRangeLoaded); this hook
 * only decides when to ask for more. A prepend bumps scrollTop away from the top
 * (usePreserveScrollOnPrepend), so onNearTop fires once per approach rather than looping.
 */
export const useCalEventsInfiniteScroll = ({
  scrollContainerRef,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
}) => {
  const { loadedRangeRef, ensureRangeLoaded } = useCalEvents()

  useScrollBoundary({
    scrollContainerRef,
    threshold: 200,
    onNearTop: useCallback(() => {
      const range = loadedRangeRef.current
      if (!range) return
      void ensureRangeLoaded(startOfMonth(subMonths(range.start, MONTHS_TO_LOAD)), range.end)
    }, [loadedRangeRef, ensureRangeLoaded]),
    onNearBottom: useCallback(() => {
      const range = loadedRangeRef.current
      if (!range) return
      void ensureRangeLoaded(range.start, endOfMonth(addMonths(range.end, MONTHS_TO_LOAD)))
    }, [loadedRangeRef, ensureRangeLoaded]),
  })
}
