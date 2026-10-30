import { Temporal } from "@js-temporal/polyfill"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  RefObject,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import {
  clipSpanToRange,
  cn,
  epochDay,
  type FirstDayOfWeek,
  startOfWeek,
  useDayGrid,
  useDisplaySettings,
  useNavigation,
  useToday,
} from "@/sdk"

import { MonthWeekRow } from "./Row"
import { nativeWeekSnap, suppressSnapPointsForFrame, WeekSnapPoints } from "./WeekSnapPoints"
import { TRACK_WEEKS } from "./useInfiniteMonths"
import type { WeekLayout } from "./useMonthEventLayout"
import { buildWeek, type MonthDay } from "./useMonthGrid"
import { attachWeekSnapSession } from "./weekSnapSession"

// How long snapping stays off after a navigation, while its scroll lands.
const NAVIGATION_SETTLE_MS = 500
const EMPTY_LAYOUT: WeekLayout = {
  allDayItems: [],
  maxLane: -1,
  timedByCol: Array.from({ length: 7 }, () => []),
}

/** The track row holding `date`'s week. */
const trackIndex = (date: Temporal.PlainDate, origin: Temporal.PlainDate, first: FirstDayOfWeek) =>
  (epochDay(startOfWeek(date, first)) - epochDay(origin)) / 7

export function MonthGrid({
  origin,
  startIndex,
  weeks,
  weekLayouts,
  rowHeight,
  scrollRef,
}: {
  /** The first week of the scroll track; `weeks` start `startIndex` weeks after it. */
  origin: Temporal.PlainDate
  startIndex: number
  weeks: MonthDay[][]
  weekLayouts: WeekLayout[]
  rowHeight: number
  scrollRef: RefObject<HTMLDivElement | null>
}) {
  const { activeDate, goToDate, navigationVersion } = useNavigation()
  const { firstDayOfWeek } = useDisplaySettings()
  const today = useToday()
  const activeDateKey = activeDate.toString()
  const { selection, isDragging } = useDayGrid()
  const prevRowHeightRef = useRef(rowHeight)

  // Hide the grid until the initial anchor scroll lands, so the user never sees the
  // pre-scroll frame (top of the grid) flash before it jumps to the active month.
  const [hasInitiallyScrolled, setHasInitiallyScrolled] = useState(false)
  const snapSessionRef = useRef<ReturnType<typeof attachWeekSnapSession> | null>(null)
  const snapPointsRef = useRef<HTMLDivElement | null>(null)

  const estimateSize = useCallback(() => rowHeight, [rowHeight])

  const virtualizer = useVirtualizer({
    count: TRACK_WEEKS,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: 3,
  })

  // When the row height changes (e.g. sidebar toggle or window resize), rescale
  // scrollTop so the viewport stays on the same week instead of jumping. Placed
  // after the virtualizer so it can call measure() on it.
  useLayoutEffect(() => {
    const el = scrollRef.current
    const prevHeight = prevRowHeightRef.current
    prevRowHeightRef.current = rowHeight

    if (!el || prevHeight === rowHeight || prevHeight === 0 || !hasInitiallyScrolled) return

    snapSessionRef.current?.pause()
    suppressSnapPointsForFrame(snapPointsRef.current)

    const ratio = rowHeight / prevHeight
    const newScrollTop = Math.round(el.scrollTop * ratio)

    el.scrollTop = newScrollTop
    virtualizer.measure()
  }, [rowHeight, virtualizer, scrollRef, hasInitiallyScrolled])

  // The initial scroll reads the latest track without re-running when it changes.
  const anchorIndexRef = useRef(0)
  anchorIndexRef.current = trackIndex(activeDate.with({ day: 1 }), origin, firstDayOfWeek)

  // Scroll to the initial anchor once. Still call measure() on rowHeight/virtualizer
  // changes because tanstack-virtual memoizes item sizes.
  const hasInitialized = useRef(false)
  const ignoreScrollUntil = useRef(0)
  const navigatingUntil = useRef(0)

  // Native CSS snapping on macOS; the JS fling session elsewhere (see WeekSnapPoints.tsx).
  // Both autoscrollers move the container with per-frame scrollBy calls, which a mandatory
  // snap would clamp back to the current row, so snapping is off while dragging.
  const snapEnabled = hasInitiallyScrolled && !isDragging
  const getSnapState = useEffectEvent(() => ({
    enabled: snapEnabled && Date.now() >= navigatingUntil.current,
    rowHeight,
  }))
  useEffect(() => {
    const el = scrollRef.current
    if (!el || nativeWeekSnap) return
    const session = attachWeekSnapSession(el, getSnapState)
    snapSessionRef.current = session
    return () => {
      session.cleanup()
      snapSessionRef.current = null
    }
  }, [scrollRef])

  useEffect(() => {
    virtualizer.measure()

    if (hasInitialized.current) return

    // `measure()` invalidates TanStack's item cache and schedules a render. Wait until
    // that render has rebuilt the sizer before scrolling; scrollToIndex is a no-op while
    // the cache is empty in TanStack Virtual 3.14.x. A row offset is exact for this grid.
    let revealFrame: number | undefined
    let finalRevealFrame: number | undefined
    const positionFrame = requestAnimationFrame(() => {
      if (hasInitialized.current) return

      hasInitialized.current = true
      ignoreScrollUntil.current = Date.now() + 200

      virtualizer.scrollToOffset(anchorIndexRef.current * rowHeight, { align: "start" })

      // Reveal only after the scroll has actually painted, so the user never sees the
      // pre-scroll frame or a mid-scroll empty grid. Mirrors the agenda's reveal timing.
      revealFrame = requestAnimationFrame(() => {
        finalRevealFrame = requestAnimationFrame(() => setHasInitiallyScrolled(true))
      })
    })

    return () => {
      cancelAnimationFrame(positionFrame)
      if (revealFrame !== undefined) cancelAnimationFrame(revealFrame)
      if (finalRevealFrame !== undefined) cancelAnimationFrame(finalRevealFrame)
    }
  }, [virtualizer, rowHeight])

  // Scrolls that only move the active date (the agenda's) don't change the version.
  const seenNavigationVersion = useRef(navigationVersion)

  // During explicit navigation, scroll the active week fully into view if needed. A jump
  // off the track starts a new one, so this also runs when the origin changes.
  useEffect(() => {
    if (navigationVersion === seenNavigationVersion.current) return
    seenNavigationVersion.current = navigationVersion
    navigatingUntil.current = Date.now() + NAVIGATION_SETTLE_MS
    snapSessionRef.current?.cancel()

    // Don't override the initial anchor scroll while it's still settling: the anchor has
    // just put the active month's first week at the top, and we must not pull the
    // viewport to the active *day*'s week instead (docs/scroll-behaviour.md).
    if (!hasInitialized.current || Date.now() < ignoreScrollUntil.current) return

    const el = scrollRef.current

    if (!el) return

    const weekIndex = trackIndex(activeDate, origin, firstDayOfWeek)
    const weekStart = weekIndex * rowHeight
    if (weekStart >= el.scrollTop && weekStart + rowHeight <= el.scrollTop + el.clientHeight) {
      return
    }

    virtualizer.scrollToIndex(weekIndex, { align: "start" })
  }, [navigationVersion, activeDate, origin, firstDayOfWeek, rowHeight, virtualizer, scrollRef])

  return (
    <div
      ref={scrollRef}
      data-slot="month-scroll"
      style={{ overflowAnchor: "none" }}
      className={cn(
        "grow overflow-y-auto overflow-x-hidden relative",
        nativeWeekSnap && snapEnabled && "motion-safe:snap-y motion-safe:snap-mandatory",
        !hasInitiallyScrolled && "invisible",
        selection && "select-none",
      )}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {nativeWeekSnap && (
          <WeekSnapPoints
            ref={snapPointsRef}
            weeks={weeks}
            firstIndex={startIndex}
            rowHeight={rowHeight}
          />
        )}
        {virtualizer.getVirtualItems().map((virtualRow) => {
          // Rows past the loaded weeks render without events until loading reaches them.
          const loaded = virtualRow.index - startIndex
          const inRange = loaded >= 0 && loaded < weeks.length
          const weekDays = inRange ? weeks[loaded] : buildWeek(origin, virtualRow.index, today)
          const createSelection =
            selection?.kind === "days"
              ? clipSpanToRange(
                  epochDay(selection.start),
                  epochDay(selection.end),
                  epochDay(weekDays[0].date),
                  epochDay(weekDays[6].date),
                )
              : null

          return (
            <div
              data-slot="month-week"
              key={weekDays[0].dateKey}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="flex flex-col border-b border-border"
            >
              <MonthWeekRow
                weekDays={weekDays}
                layout={inRange ? weekLayouts[loaded] : EMPTY_LAYOUT}
                activeDateKey={activeDateKey}
                onDayClick={goToDate}
                createSelection={createSelection}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
