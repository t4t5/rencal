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

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"
import { useEventDrag } from "@/contexts/EventDragContext"

import { clipSpanToRange } from "@/hooks/cal-events/all-day-lanes"
import type { WeekLayout } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { useCreateSelectionColor } from "@/hooks/useCreateSelectionColor"
import type { CalendarEvent } from "@/lib/cal-events"
import { createDebugLogger } from "@/lib/debug"
import { epochDay } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { MonthWeekRow } from "./Row"
import { useDragToCreateDays } from "./useDragToCreateDays"
import { attachWeekSnapSession } from "./weekSnapSession"

const debugMonthScroll = createDebugLogger("month-scroll")

const DEFAULT_ROW_HEIGHT = 150

export function MonthGrid({
  weeks,
  weekLayouts,
  activeEventKey,
  selectedEventKey,
  activeDate,
  anchorWeekIndex,
  scrollRef,
  isNavigating,
  onDayClick,
  onEventClick,
  draftEvent,
  dimmed,
}: {
  weeks: MonthDay[][]
  weekLayouts: WeekLayout[]
  activeEventKey: string | null
  selectedEventKey: string | null
  activeDate: Temporal.PlainDate
  anchorWeekIndex: number
  scrollRef: RefObject<HTMLDivElement | null>
  isNavigating: () => boolean
  onDayClick: (date: Temporal.PlainDate) => void
  onEventClick: (eventKey: string) => void
  draftEvent: CalendarEvent | null
  dimmed: boolean
}) {
  const activeDateKey = activeDate.toString()
  const { navigationVersion } = useCalendarNavigation()
  const { selection, startCreateDrag } = useDragToCreateDays(scrollRef)
  const { drag } = useEventDrag()
  const createSelectionColor = useCreateSelectionColor()

  // Each day cell is a square: row height tracks the column width
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT)
  const prevRowHeightRef = useRef(rowHeight)

  // Hide the grid until the initial anchor scroll lands, so the user never sees the
  // pre-scroll frame (top of the grid) flash before it jumps to the active month.
  const [hasInitiallyScrolled, setHasInitiallyScrolled] = useState(false)
  const snapSessionRef = useRef<ReturnType<typeof attachWeekSnapSession> | null>(null)

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

  const estimateSize = useCallback(() => rowHeight, [rowHeight])

  const virtualizer = useVirtualizer({
    count: weeks.length,
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

    const ratio = rowHeight / prevHeight
    const newScrollTop = Math.round(el.scrollTop * ratio)

    debugMonthScroll("rescale scrollTop after row height change", {
      prevHeight,
      rowHeight,
      ratio,
      prevScrollTop: el.scrollTop,
      newScrollTop,
    })

    el.scrollTop = newScrollTop
    virtualizer.measure()
  }, [rowHeight, virtualizer, scrollRef, hasInitiallyScrolled])

  // anchorWeekIndex shifts when weeks are prepended/appended; keep it in a ref so the
  // one-time initial scroll can read the latest value without re-running on every shift.
  const anchorWeekIndexRef = useRef(anchorWeekIndex)
  anchorWeekIndexRef.current = anchorWeekIndex

  // Keep the viewport in place when weeks are prepended
  const prevRef = useRef({ firstKey: weeks[0]?.[0]?.dateKey, count: weeks.length })

  useLayoutEffect(() => {
    const curFirstKey = weeks[0]?.[0]?.dateKey

    const { firstKey: prevFirstKey, count: prevCount } = prevRef.current

    prevRef.current = { firstKey: curFirstKey, count: weeks.length }

    if (curFirstKey === prevFirstKey || weeks.length <= prevCount) return

    const added = weeks.length - prevCount
    const el = scrollRef.current
    if (!el) return
    const delta = added * rowHeight
    const from = el.scrollTop
    const to = from + delta

    debugMonthScroll("preserve offset after prepend", {
      prevFirstKey,
      curFirstKey,
      added,
      rowHeight,
      from,
      to,
    })

    virtualizer.scrollToOffset(to, { align: "start" })
    snapSessionRef.current?.shift(delta)
  })

  // Scroll to the initial anchor once. anchorWeekIndex is NOT a dep — it shifts when
  // weeks are prepended/appended and we don't want to jump back then. Still call
  // measure() on rowHeight/virtualizer changes because tanstack-virtual memoizes item sizes.
  const hasInitialized = useRef(false)
  const ignoreScrollUntil = useRef(0)

  const getSnapState = useEffectEvent(() => ({
    enabled: hasInitiallyScrolled && !selection && !drag && !isNavigating(),
    rowHeight,
  }))
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
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

    hasInitialized.current = true
    ignoreScrollUntil.current = Date.now() + 200

    debugMonthScroll("initial anchor scroll", { idx, rowHeight })

    virtualizer.scrollToIndex(idx, { align: "start" })

    // Reveal only after the scroll has actually painted, so the user never sees the
    // pre-scroll frame or a mid-scroll empty grid. Mirrors the agenda's reveal timing.
    requestAnimationFrame(() => requestAnimationFrame(() => setHasInitiallyScrolled(true)))
  }, [virtualizer, rowHeight])

  // During explicit navigation, scroll the active week fully into view if needed.
  useEffect(() => {
    if (!hasInitialized.current || !isNavigating()) return

    snapSessionRef.current?.cancel()

    // Don't override the initial anchor scroll while it's still settling. On open,
    // isNavigating() is already true (the agenda's mount-time scroll sets the shared flag),
    // and the anchor has just put the active month's first week at the top — we must not
    // pull the viewport to the active *day*'s week instead (docs/scroll-behaviour.md).
    if (Date.now() < ignoreScrollUntil.current) return

    debugMonthScroll("navigation scroll check", { activeDateKey })

    const el = scrollRef.current

    if (!el) return

    const weekIndex = weeks.findIndex((week) => week.some((d) => d.dateKey === activeDateKey))

    if (weekIndex < 0) return

    const item = virtualizer.getVirtualItems().find((v) => v.index === weekIndex)

    if (item) {
      const viewStart = el.scrollTop
      const viewEnd = viewStart + el.clientHeight
      if (item.start >= viewStart && item.end <= viewEnd) return
    }

    debugMonthScroll("navigation scroll to active week", { activeDateKey, weekIndex })

    virtualizer.scrollToIndex(weekIndex, { align: "start" })
  }, [activeDateKey, navigationVersion, weeks, virtualizer, isNavigating, scrollRef])

  const onScrollEnd = useEffectEvent(() => {
    const el = scrollRef.current
    if (!el) return
    debugMonthScroll("week snap settled", {
      scrollTop: el.scrollTop,
      rowHeight,
      offsetFromWeek: el.scrollTop - Math.round(el.scrollTop / rowHeight) * rowHeight,
    })
  })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    el.addEventListener("scrollend", onScrollEnd)
    return () => {
      el.removeEventListener("scrollend", onScrollEnd)
    }
  }, [scrollRef])

  return (
    <div
      ref={scrollRef}
      data-drag-scroll
      className={cn(
        "grow overflow-y-auto overflow-x-hidden relative",
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
              key={weekDays[0].dateKey}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="flex flex-col border-b border-divider"
            >
              <MonthWeekRow
                weekDays={weekDays}
                layout={weekLayouts[virtualRow.index]}
                activeEventKey={activeEventKey}
                selectedEventKey={selectedEventKey}
                activeDateKey={activeDateKey}
                onDayClick={onDayClick}
                onEventClick={onEventClick}
                draftEvent={draftEvent}
                dimmed={dimmed}
                createSelection={createSelection}
                createSelectionColor={createSelectionColor}
                startCreateDrag={startCreateDrag}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
