import { Temporal } from "@js-temporal/polyfill"
import { RefObject, useEffect, useState } from "react"

import { useDisplaySettings } from "@/sdk"

import { monthGridBounds } from "./useMonthGrid"

/** Months rendered on each side of the active one, and the step the range grows by. */
const MONTHS_TO_LOAD = 2
// Begin loading several week rows before the native macOS top snap/overscroll zone.
const PRELOAD_PX = 600
// Keep the initial-positioning guard narrower than the preload boundary so compact
// windows can still arm infinite scrolling within the initial five-month range.
const SCROLL_AWAY_PX = 200
const THROTTLE_MS = 150

// rangeStart / rangeEnd are the 1st of a month; rangeEnd is exclusive (the 1st of the first
// not-yet-rendered month), matching useMonthGrid.
const rangeStartFor = (date: Temporal.PlainDate) =>
  date.with({ day: 1 }).subtract({ months: MONTHS_TO_LOAD })
const rangeEndFor = (date: Temporal.PlainDate) =>
  date.with({ day: 1 }).add({ months: MONTHS_TO_LOAD + 1 })

/**
 * Owns the growing month range rendered by the infinite month grid. The grid is the source
 * of truth for what's visible; the caller loads events for [start, end), which never blocks
 * scrolling (see docs/scroll-behaviour.md).
 */
export function useInfiniteMonths({
  scrollContainerRef,
  activeDate,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  activeDate: Temporal.PlainDate
}) {
  const { firstDayOfWeek } = useDisplaySettings()

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

  // Grow the range near either edge. Nothing grows until the user has scrolled away from
  // both edges: the initial programmatic scroll starts at scrollTop 0, which is not intent.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    let armed = false
    let lastRun = 0
    let trailing: ReturnType<typeof setTimeout> | undefined

    const check = () => {
      lastRun = Date.now()
      const { scrollTop, scrollHeight, clientHeight } = el
      const fromBottom = scrollHeight - scrollTop - clientHeight
      if (!armed) {
        if (scrollTop < SCROLL_AWAY_PX || fromBottom < SCROLL_AWAY_PX) return
        armed = true
      }
      // Prepending shifts the viewport away from the top (Grid preserves scroll offset),
      // so this fires once per approach rather than runaway-growing.
      if (scrollTop < PRELOAD_PX) {
        setRangeStart((start) => start.subtract({ months: MONTHS_TO_LOAD }).with({ day: 1 }))
      }
      if (fromBottom < PRELOAD_PX) {
        setRangeEnd((end) => end.add({ months: MONTHS_TO_LOAD }).with({ day: 1 }))
      }
    }

    // Run on the leading edge, but keep one trailing check so a fast gesture cannot
    // cross the preload boundary entirely inside the throttle window.
    const onScroll = () => {
      const elapsed = Date.now() - lastRun
      if (elapsed >= THROTTLE_MS) {
        clearTimeout(trailing)
        trailing = undefined
        check()
      } else if (trailing === undefined) {
        trailing = setTimeout(() => {
          trailing = undefined
          check()
        }, THROTTLE_MS - elapsed)
      }
    }

    el.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      el.removeEventListener("scroll", onScroll)
      clearTimeout(trailing)
    }
  }, [scrollContainerRef])

  const { gridStart, gridEnd } = monthGridBounds(rangeStart, rangeEnd, firstDayOfWeek)
  return { rangeStart, rangeEnd, gridStart, gridEnd }
}
