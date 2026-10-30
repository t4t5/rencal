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
  dragScrollProps,
  epochDay,
  useDayDragToCreate,
  useIsDraggingEvent,
  useNavigation,
} from "@/sdk"

import { MonthWeekRow } from "./Row"
import { nativeWeekSnap, suppressSnapPointsForFrame, WeekSnapPoints } from "./WeekSnapPoints"
import type { WeekLayout } from "./useMonthEventLayout"
import type { MonthDay } from "./useMonthGrid"
import { attachWeekSnapSession } from "./weekSnapSession"

const DEFAULT_ROW_HEIGHT = 150
// How long snapping stays off after a navigation, while its scroll lands.
const NAVIGATION_SETTLE_MS = 500

export function MonthGrid({
  weeks,
  weekLayouts,
  anchorWeekIndex,
  scrollRef,
}: {
  weeks: MonthDay[][]
  weekLayouts: WeekLayout[]
  anchorWeekIndex: number
  scrollRef: RefObject<HTMLDivElement | null>
}) {
  const { activeDate, goToDate, navigationVersion } = useNavigation()
  const activeDateKey = activeDate.toString()
  const { selection, startCreateDrag } = useDayDragToCreate(scrollRef)
  const isDraggingEvent = useIsDraggingEvent()

  // Each day cell is a square: row height tracks the column width
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT)
  const prevRowHeightRef = useRef(rowHeight)

  // Hide the grid until the initial anchor scroll lands, so the user never sees the
  // pre-scroll frame (top of the grid) flash before it jumps to the active month.
  const [hasInitiallyScrolled, setHasInitiallyScrolled] = useState(false)
  const snapSessionRef = useRef<ReturnType<typeof attachWeekSnapSession> | null>(null)
  const snapPointsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => {
      if (el.clientWidth > 0) setRowHeight(Math.round(el.clientWidth / 7))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [scrollRef])

  const prevRef = useRef({ firstKey: weeks[0]?.[0]?.dateKey, count: weeks.length })
  const curFirstKey = weeks[0]?.[0]?.dateKey
  const isPrepending =
    curFirstKey !== prevRef.current.firstKey && weeks.length > prevRef.current.count
  const nativeSnapRestorePendingRef = useRef(false)
  const nativeSnapRestoreTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const nativeSnapRestoreCleanupRef = useRef<(() => void) | undefined>(undefined)
  const [, setSnapRestoreVersion] = useState(0)

  const estimateSize = useCallback(() => rowHeight, [rowHeight])
  const getItemKey = useCallback((index: number) => weeks[index][0].dateKey, [weeks])

  const virtualizer = useVirtualizer({
    count: weeks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey,
    // Preserve the visible week when older weeks are prepended. TanStack updates its
    // tracked offset and rendered window in the same pass, avoiding a blank frame.
    anchorTo: "end",
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

  // anchorWeekIndex shifts when weeks are prepended/appended; keep it in a ref so the
  // one-time initial scroll can read the latest value without re-running on every shift.
  const anchorWeekIndexRef = useRef(anchorWeekIndex)
  anchorWeekIndexRef.current = anchorWeekIndex

  // TanStack keeps the viewport in place when weeks are prepended. The remaining
  // bookkeeping restores native snapping after the snap-free prepend commit and carries
  // the Linux JS fling across the shifted coordinate space.

  useLayoutEffect(() => {
    const { firstKey: prevFirstKey, count: prevCount } = prevRef.current

    prevRef.current = { firstKey: curFirstKey, count: weeks.length }

    if (curFirstKey === prevFirstKey || weeks.length <= prevCount) return

    const added = weeks.length - prevCount
    const delta = added * rowHeight

    snapSessionRef.current?.shift(delta)

    // The prepend render removes native scroll snapping before the changed snap-point
    // geometry is committed. Keep it off until WebKit declares scrolling finished: restoring
    // it on the next frame can resume the fling toward its stale, pre-prepend snap target.
    if (nativeWeekSnap) {
      const el = scrollRef.current
      nativeSnapRestorePendingRef.current = true
      nativeSnapRestoreCleanupRef.current?.()
      clearTimeout(nativeSnapRestoreTimerRef.current)

      let restored = false
      const restore = () => {
        if (restored) return
        restored = true
        el?.removeEventListener("scrollend", restore)
        clearTimeout(nativeSnapRestoreTimerRef.current)
        nativeSnapRestoreTimerRef.current = undefined
        nativeSnapRestoreCleanupRef.current = undefined
        nativeSnapRestorePendingRef.current = false
        setSnapRestoreVersion((version) => version + 1)
      }

      el?.addEventListener("scrollend", restore, { once: true })
      nativeSnapRestoreTimerRef.current = setTimeout(restore, 300)
      nativeSnapRestoreCleanupRef.current = () => {
        restored = true
        el?.removeEventListener("scrollend", restore)
      }
    }
  })

  // Scroll to the initial anchor once. anchorWeekIndex is NOT a dep — it shifts when
  // weeks are prepended/appended and we don't want to jump back then. Still call
  // measure() on rowHeight/virtualizer changes because tanstack-virtual memoizes item sizes.
  const hasInitialized = useRef(false)
  const ignoreScrollUntil = useRef(0)
  const navigatingUntil = useRef(0)

  useEffect(
    () => () => {
      nativeSnapRestoreCleanupRef.current?.()
      clearTimeout(nativeSnapRestoreTimerRef.current)
    },
    [],
  )

  // Native CSS snapping on macOS; the JS fling session elsewhere (see WeekSnapPoints.tsx).
  // Both autoscrollers move the container with per-frame scrollBy calls, which a mandatory
  // snap would clamp back to the current row, so snapping is off while dragging.
  const nativeSnapSuspended =
    nativeWeekSnap && (isPrepending || nativeSnapRestorePendingRef.current)
  const snapEnabled = hasInitiallyScrolled && !selection && !isDraggingEvent && !nativeSnapSuspended
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

    const idx = anchorWeekIndexRef.current

    if (idx < 0) {
      // No anchor to position to — reveal as-is rather than stay hidden.
      setHasInitiallyScrolled(true)
      return
    }

    // `measure()` invalidates TanStack's item cache and schedules a render. Wait until
    // that render has rebuilt the sizer before scrolling; scrollToIndex is a no-op while
    // the cache is empty in TanStack Virtual 3.14.x. A row offset is exact for this grid.
    let revealFrame: number | undefined
    let finalRevealFrame: number | undefined
    const positionFrame = requestAnimationFrame(() => {
      if (hasInitialized.current) return

      hasInitialized.current = true
      ignoreScrollUntil.current = Date.now() + 200

      const target = idx * rowHeight
      virtualizer.scrollToOffset(target, { align: "start" })

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

  // A deliberate navigation not yet brought into view: the weeks may first have to grow
  // to reach its date. Scrolls that only move the active date (the agenda's) never set it.
  const pendingNavigation = useRef(false)
  const seenNavigationVersion = useRef(navigationVersion)

  // During explicit navigation, scroll the active week fully into view if needed.
  useEffect(() => {
    if (navigationVersion !== seenNavigationVersion.current) {
      seenNavigationVersion.current = navigationVersion
      pendingNavigation.current = true
      navigatingUntil.current = Date.now() + NAVIGATION_SETTLE_MS
      snapSessionRef.current?.cancel()
    }
    if (!pendingNavigation.current) return

    // Don't override the initial anchor scroll while it's still settling: the anchor has
    // just put the active month's first week at the top, and we must not pull the
    // viewport to the active *day*'s week instead (docs/scroll-behaviour.md).
    if (!hasInitialized.current || Date.now() < ignoreScrollUntil.current) {
      pendingNavigation.current = false
      return
    }

    const el = scrollRef.current

    if (!el) return

    const weekIndex = weeks.findIndex((week) => week.some((d) => d.dateKey === activeDateKey))

    if (weekIndex < 0) return

    pendingNavigation.current = false

    const item = virtualizer.getVirtualItems().find((v) => v.index === weekIndex)

    if (item) {
      const viewStart = el.scrollTop
      const viewEnd = viewStart + el.clientHeight
      if (item.start >= viewStart && item.end <= viewEnd) return
    }

    virtualizer.scrollToIndex(weekIndex, { align: "start" })
  }, [activeDateKey, navigationVersion, weeks, virtualizer, scrollRef])

  return (
    <div
      ref={scrollRef}
      {...dragScrollProps}
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
          <WeekSnapPoints ref={snapPointsRef} weeks={weeks} rowHeight={rowHeight} />
        )}
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const weekDays = weeks[virtualRow.index]
          const createSelection = selection
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
                layout={weekLayouts[virtualRow.index]}
                activeDateKey={activeDateKey}
                onDayClick={goToDate}
                createSelection={createSelection}
                startCreateDrag={startCreateDrag}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
