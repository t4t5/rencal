import { RefObject, useCallback } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { MONTHS_TO_LOAD } from "@/lib/cal-events-range"

/**
 * Extends the active range as the agenda is scrolled near either end. Fetching, dedup,
 * and single-flight all live in CalEventsContext (extendActiveRange); this hook
 * only decides when to ask for more. A prepend bumps scrollTop away from the top
 * (usePreserveScrollOnPrepend), so onNearTop fires once per approach rather than looping.
 */
export const useCalEventsInfiniteScroll = ({
  scrollContainerRef,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
}) => {
  const { extendActiveRange } = useCalEvents()

  useScrollBoundary({
    scrollContainerRef,
    threshold: 200,
    onNearTop: useCallback(() => {
      void extendActiveRange(({ start, end }) => ({
        start: start.subtract({ months: MONTHS_TO_LOAD }).with({ day: 1 }),
        end,
      }))
    }, [extendActiveRange]),
    onNearBottom: useCallback(() => {
      void extendActiveRange(({ start, end }) => ({
        start,
        end: end.with({ day: 1 }).add({ months: MONTHS_TO_LOAD }),
      }))
    }, [extendActiveRange]),
  })
}
