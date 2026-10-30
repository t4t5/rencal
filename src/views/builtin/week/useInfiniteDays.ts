import { Temporal } from "@js-temporal/polyfill"
import { type RefObject, useEffect, useLayoutEffect, useMemo, useState } from "react"

import { epochDay, type FirstDayOfWeek, startOfWeek, useDisplaySettings, useToday } from "@/sdk"

import { GUTTER_WIDTH } from "./grid"

/** Days on each side of the date the strip opened on: the scrollable track spans twice this. */
const HALF_TRACK_DAYS = 3653
export const TRACK_DAYS = 2 * HALF_TRACK_DAYS
/** Days rendered beyond the viewport, and the step the rendered range grows by. */
const BUFFER_DAYS = 7
/** Grow the rendered range when the viewport comes this close to its edge. */
const EDGE_DAYS = 3
/** A jump this close to the rendered range extends it, so the smooth scroll there stays filled. */
const MAX_BRIDGE_DAYS = 28

export type WeekDay = {
  date: Temporal.PlainDate
  dateKey: string
  isToday: boolean
  isWeekend: boolean
}

function buildDay(date: Temporal.PlainDate, today: Temporal.PlainDate): WeekDay {
  return {
    date,
    dateKey: date.toString(),
    isToday: date.equals(today),
    isWeekend: date.dayOfWeek === 6 || date.dayOfWeek === 7,
  }
}

/** The rendered days, as [start, end) indexes on the track that begins at `origin`. */
type Strip = { origin: Temporal.PlainDate; start: number; end: number }

/** `date`'s week with BUFFER_DAYS on each side, on the given track or a new one centred on it. */
function stripAround(
  date: Temporal.PlainDate,
  firstDayOfWeek: FirstDayOfWeek,
  origin = date.subtract({ days: HALF_TRACK_DAYS }),
): Strip {
  const weekStart = epochDay(startOfWeek(date, firstDayOfWeek)) - epochDay(origin)
  return {
    origin,
    start: Math.max(0, weekStart - BUFFER_DAYS),
    end: Math.min(TRACK_DAYS, weekStart + 7 + BUFFER_DAYS),
  }
}

/**
 * The days of the continuously-scrollable week view. The scroll container holds a
 * fixed track of TRACK_DAYS around the date the view opened on, and only the days
 * near the viewport are rendered, each at its own offset on the track. Growing the
 * rendered range therefore never moves what's on screen, so the scroll position
 * never needs correcting; correcting it let WebKitGTK show the old content at the
 * new offset for a frame. The caller loads events for [start, end).
 */
export function useInfiniteDays({
  scrollContainerRef,
  activeDate,
  dayWidth,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  activeDate: Temporal.PlainDate
  dayWidth: number
}): {
  origin: Temporal.PlainDate
  startIndex: number
  days: WeekDay[]
  start: Temporal.PlainDate
  end: Temporal.PlainDate
} {
  const { firstDayOfWeek } = useDisplaySettings()
  const today = useToday()
  const [strip, setStrip] = useState(() => stripAround(activeDate, firstDayOfWeek))

  // A jump outside the rendered days renders the target's week, joined to the current
  // range when close; a jump off the track starts a new track around it.
  const activeIndex = epochDay(activeDate) - epochDay(strip.origin)
  if (activeIndex < strip.start || activeIndex >= strip.end) {
    const target = stripAround(activeDate, firstDayOfWeek, strip.origin)
    const onTrack = target.start > 0 && target.end < TRACK_DAYS
    const gap = Math.max(target.start - strip.end, strip.start - target.end)
    setStrip(
      !onTrack
        ? stripAround(activeDate, firstDayOfWeek)
        : gap <= MAX_BRIDGE_DAYS
          ? {
              origin: strip.origin,
              start: Math.min(strip.start, target.start),
              end: Math.max(strip.end, target.end),
            }
          : target,
    )
  }

  // Keep the viewport and EDGE_DAYS around it rendered while the user scrolls.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    let frame = 0
    const update = () => {
      frame = 0
      const first = Math.floor(el.scrollLeft / dayWidth)
      const last = Math.ceil((el.scrollLeft + el.clientWidth - GUTTER_WIDTH) / dayWidth)
      setStrip((current) => {
        const start =
          first - EDGE_DAYS < current.start ? Math.max(0, first - BUFFER_DAYS) : current.start
        const end =
          last + EDGE_DAYS > current.end ? Math.min(TRACK_DAYS, last + BUFFER_DAYS) : current.end
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
  }, [scrollContainerRef, dayWidth])

  const { origin, start, end } = strip
  const days = useMemo(
    () =>
      Array.from({ length: end - start }, (_, i) =>
        buildDay(origin.add({ days: start + i }), today),
      ),
    [origin, start, end, today],
  )

  return {
    origin,
    startIndex: start,
    days,
    start: origin.add({ days: start }),
    end: origin.add({ days: end }),
  }
}

/** Day column width: seven days fill the viewport right of the gutter, never under DAY_WIDTH_MIN. */
const DAY_WIDTH_MIN = 100

export function useDayWidth(scrollContainerRef: RefObject<HTMLDivElement | null>): {
  dayWidth: number
  measured: boolean
} {
  const [dayWidth, setDayWidth] = useState(180)
  const [measured, setMeasured] = useState(false)

  useLayoutEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const update = () => {
      setDayWidth(Math.max(DAY_WIDTH_MIN, (el.clientWidth - GUTTER_WIDTH) / 7))
      setMeasured(true)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scrollContainerRef])

  return { dayWidth, measured }
}
