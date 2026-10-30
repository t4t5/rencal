import { Temporal } from "@js-temporal/polyfill"
import { type RefObject, useEffect, useLayoutEffect, useState } from "react"

import { epochDay, type FirstDayOfWeek, startOfWeek, useDisplaySettings } from "@/sdk"

/** Weeks on each side of the date the grid opened on: the scrollable track spans twice this. */
const HALF_TRACK_WEEKS = 522
export const TRACK_WEEKS = 2 * HALF_TRACK_WEEKS
/** Months loaded on each side of the active one. */
const MONTHS_TO_LOAD = 2
/** Weeks loaded beyond the viewport, and the step the loaded range grows by. */
const BUFFER_WEEKS = 9
/** Grow the loaded range when the viewport comes this close to its edge. */
const EDGE_WEEKS = 4
/** A jump this close to the loaded range extends it rather than replacing it. */
const MAX_BRIDGE_WEEKS = 8

const DEFAULT_ROW_HEIGHT = 150

/** The loaded weeks, as [start, end) indexes on the track that begins at `origin`. */
type Strip = { origin: Temporal.PlainDate; start: number; end: number }

const weekIndex = (date: Temporal.PlainDate, strip: Pick<Strip, "origin">, first: FirstDayOfWeek) =>
  (epochDay(startOfWeek(date, first)) - epochDay(strip.origin)) / 7

/** `date`'s month with MONTHS_TO_LOAD on each side, on the given track or a new one around it. */
function stripAround(
  date: Temporal.PlainDate,
  firstDayOfWeek: FirstDayOfWeek,
  origin = startOfWeek(date, firstDayOfWeek).subtract({ weeks: HALF_TRACK_WEEKS }),
): Strip {
  const month = date.with({ day: 1 })
  const track = { origin }
  return {
    origin,
    start: Math.max(
      0,
      weekIndex(month.subtract({ months: MONTHS_TO_LOAD }), track, firstDayOfWeek),
    ),
    end: Math.min(
      TRACK_WEEKS,
      weekIndex(month.add({ months: MONTHS_TO_LOAD + 1 }), track, firstDayOfWeek),
    ),
  }
}

/**
 * The weeks of the endlessly-scrollable month grid. The scroll container holds a fixed
 * track of TRACK_WEEKS rows around the date the grid opened on, so loading more weeks
 * never moves what's on screen and the scroll position never needs correcting:
 * correcting it while WebKitGTK still animated a wheel scroll showed the grid two
 * months away for several frames. The caller loads events for [start, end) and lays
 * them out; rows outside it render without events until the range grows to them.
 */
export function useInfiniteMonths({
  scrollContainerRef,
  activeDate,
  rowHeight,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  activeDate: Temporal.PlainDate
  rowHeight: number
}) {
  const { firstDayOfWeek } = useDisplaySettings()
  const [strip, setStrip] = useState(() => stripAround(activeDate, firstDayOfWeek))

  // A new first day of the week moves the track to that week start, keeping the rows in place.
  // A jump outside the loaded weeks loads the target's months, joined to the current range
  // when close; a jump off the track starts a new track around it.
  const weekStart = startOfWeek(strip.origin, firstDayOfWeek)
  const activeIndex = weekIndex(activeDate, strip, firstDayOfWeek)
  if (!weekStart.equals(strip.origin)) {
    setStrip({ ...strip, origin: weekStart })
  } else if (activeIndex < strip.start || activeIndex >= strip.end) {
    const target = stripAround(activeDate, firstDayOfWeek, strip.origin)
    const onTrack = target.start > 0 && target.end < TRACK_WEEKS
    const gap = Math.max(target.start - strip.end, strip.start - target.end)
    setStrip(
      !onTrack
        ? stripAround(activeDate, firstDayOfWeek)
        : gap <= MAX_BRIDGE_WEEKS
          ? {
              origin: strip.origin,
              start: Math.min(strip.start, target.start),
              end: Math.max(strip.end, target.end),
            }
          : target,
    )
  }

  // Keep the viewport and EDGE_WEEKS around it loaded while the user scrolls. Only scroll
  // events count: before the initial scroll lands, scrollTop 0 is not where the user is.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    let frame = 0
    const update = () => {
      frame = 0
      const first = Math.floor(el.scrollTop / rowHeight)
      const last = Math.ceil((el.scrollTop + el.clientHeight) / rowHeight)
      setStrip((current) => {
        const start =
          first - EDGE_WEEKS < current.start ? Math.max(0, first - BUFFER_WEEKS) : current.start
        const end =
          last + EDGE_WEEKS > current.end ? Math.min(TRACK_WEEKS, last + BUFFER_WEEKS) : current.end
        if (start >= current.start && end <= current.end) return current
        return {
          origin: current.origin,
          start: Math.min(start, current.start),
          end: Math.max(end, current.end),
        }
      })
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      el.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [scrollContainerRef, rowHeight])

  return {
    origin: strip.origin,
    startIndex: strip.start,
    endIndex: strip.end,
    start: strip.origin.add({ weeks: strip.start }),
    end: strip.origin.add({ weeks: strip.end }),
  }
}

/** Row height: each day cell is a square, so a row is a seventh of the grid's width. */
export function useRowHeight(scrollContainerRef: RefObject<HTMLDivElement | null>): number {
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT)

  useLayoutEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const update = () => {
      if (el.clientWidth > 0) setRowHeight(Math.round(el.clientWidth / 7))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [scrollContainerRef])

  return rowHeight
}
