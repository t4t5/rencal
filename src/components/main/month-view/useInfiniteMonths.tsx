import { Temporal } from "@js-temporal/polyfill"
import { RefObject, useCallback, useEffect, useState } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { monthGridBounds } from "@/hooks/cal-events/useMonthGrid"
import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { MONTHS_TO_LOAD } from "@/lib/cal-events-range"
import { createDebugLogger } from "@/lib/debug"

const debugMonthScroll = createDebugLogger("month-scroll")

// rangeStart / rangeEnd are the 1st of a month; rangeEnd is exclusive (the 1st of the first
// not-yet-rendered month), matching useMonthGrid.
const rangeStartFor = (date: Temporal.PlainDate) =>
  date.with({ day: 1 }).subtract({ months: MONTHS_TO_LOAD })
const rangeEndFor = (date: Temporal.PlainDate) =>
  date.with({ day: 1 }).add({ months: MONTHS_TO_LOAD + 1 })

/**
 * Owns the growing month range rendered by the infinite month grid. The grid is the source
 * of truth for what's visible; event loading just follows it via `ensureRangeLoaded` and
 * never blocks scrolling (see docs/scroll-behaviour.md).
 */
export function useInfiniteMonths({
  scrollContainerRef,
  activeDate,
  visibleCalendarIds,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  activeDate: Temporal.PlainDate
  visibleCalendarIds: string[]
}) {
  const { ensureRangeLoaded } = useCalEvents()

  const [rangeStart, setRangeStart] = useState(() => rangeStartFor(activeDate))
  const [rangeEnd, setRangeEnd] = useState(() => rangeEndFor(activeDate))

  // Jump navigation: if activeDate lands outside the rendered range, extend toward it.
  useEffect(() => {
    if (Temporal.PlainDate.compare(activeDate, rangeStart) < 0) {
      setRangeStart(rangeStartFor(activeDate))
    } else if (Temporal.PlainDate.compare(activeDate, rangeEnd) >= 0) {
      setRangeEnd(rangeEndFor(activeDate))
    }
  }, [activeDate, rangeStart, rangeEnd])

  // Keep loaded events in step with the rendered weeks.
  const visibleCalendarKey = visibleCalendarIds.join("|")
  useEffect(() => {
    const { gridStart, gridEnd } = monthGridBounds(rangeStart, rangeEnd)
    debugMonthScroll("ensure month range loaded", { gridStart, gridEnd })
    void ensureRangeLoaded(gridStart, gridEnd)
  }, [rangeStart, rangeEnd, visibleCalendarKey, ensureRangeLoaded])

  useScrollBoundary({
    scrollContainerRef,
    threshold: 200,
    checkOnMount: false,
    requireScrollAwayBeforeBoundary: true,
    onNearTop: useCallback(() => {
      // Prepending shifts the viewport away from the top (Grid preserves scroll offset),
      // so this fires once per approach rather than runaway-growing.
      setRangeStart((start) => start.subtract({ months: MONTHS_TO_LOAD }).with({ day: 1 }))
    }, []),
    onNearBottom: useCallback(() => {
      setRangeEnd((end) => end.add({ months: MONTHS_TO_LOAD }).with({ day: 1 }))
    }, []),
  })

  return { rangeStart, rangeEnd }
}
