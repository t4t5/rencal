import { type RefObject, useLayoutEffect, useRef, useState } from "react"

import { HOUR_HEIGHT } from "./grid"

type VisibleHours = { start_hour: number; end_hour: number }

/** Fit preferred hours below the sticky header, keeping the full day scrollable. */
export function useVisibleHours(
  scrollRef: RefObject<HTMLDivElement | null>,
  headerRef: RefObject<HTMLDivElement | null>,
  hours: VisibleHours | null,
) {
  const [availableHeight, setAvailableHeight] = useState(0)
  const start = hours?.start_hour
  const end = hours?.end_hour
  const enabled = start !== undefined && end !== undefined && start >= 0 && start < end && end <= 24
  const hourHeight = enabled && availableHeight > 0 ? availableHeight / (end - start) : HOUR_HEIGHT
  const previous = useRef<{ height: number; start?: number; end?: number } | null>(null)
  const measuredHeight = useRef(0)
  const hourBeforeResize = useRef<number | null>(null)

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    const header = headerRef.current
    if (!scroll || !header) return

    const measure = () => {
      const nextHeight = Math.max(0, scroll.clientHeight - header.offsetHeight)
      if (nextHeight === measuredHeight.current) return
      // Capture before React shrinks the grid: the browser may clamp scrollTop
      // to the new bottom before the positioning layout effect runs.
      hourBeforeResize.current = previous.current
        ? scroll.scrollTop / previous.current.height
        : null
      measuredHeight.current = nextHeight
      setAvailableHeight(nextHeight)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroll)
    observer.observe(header)
    return () => observer.disconnect()
  }, [scrollRef, headerRef])

  // Run after React has applied the new grid height, so a scroll near midnight
  // cannot be clamped against the previous, shorter grid.
  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll || availableHeight <= 0) return
    const prev = previous.current
    const rangeChanged = prev?.start !== start || prev?.end !== end
    if (enabled && (!prev || rangeChanged)) {
      scroll.scrollTop = start * hourHeight
    } else if (prev && prev.height !== hourHeight) {
      scroll.scrollTop = (hourBeforeResize.current ?? scroll.scrollTop / prev.height) * hourHeight
    }
    hourBeforeResize.current = null
    previous.current = { height: hourHeight, start, end }
  }, [scrollRef, availableHeight, hourHeight, start, end, enabled])

  return hourHeight
}
