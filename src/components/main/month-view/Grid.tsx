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

import type { WeekLayout } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import type { CalendarEvent } from "@/lib/cal-events"
import { createDebugLogger } from "@/lib/debug"
import { formatDateKey } from "@/lib/event-time"

import { MonthWeekRow } from "./Row"
import { pickActiveMonth } from "./pickActiveMonth"

const debugMonthScroll = createDebugLogger("month-scroll")

const DEFAULT_ROW_HEIGHT = 150
export const LANE_HEIGHT = 20
export const LANE_GAP = 3

export function MonthGrid({
  weeks,
  weekLayouts,
  activeEventKey,
  selectedEventKey,
  activeDateKey,
  anchorWeekIndex,
  scrollRef,
  isNavigating,
  onDayClick,
  onEventClick,
  onScrollMonthChange,
  draftEvent,
  dimmed,
}: {
  weeks: MonthDay[][]
  weekLayouts: WeekLayout[]
  activeEventKey: string | null
  selectedEventKey: string | null
  activeDateKey: string
  anchorWeekIndex: number
  scrollRef: RefObject<HTMLDivElement | null>
  isNavigating: () => boolean
  onDayClick: (date: Date) => void
  onEventClick: (eventKey: string) => void
  onScrollMonthChange: (date: Date) => void
  draftEvent: CalendarEvent | null
  dimmed: boolean
}) {
  // Each day cell is a square: row height tracks the column width
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT)

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

    const from = virtualizer.scrollOffset ?? 0
    const to = from + added * rowHeight

    debugMonthScroll("preserve offset after prepend", {
      prevFirstKey,
      curFirstKey,
      added,
      rowHeight,
      from,
      to,
    })

    virtualizer.scrollToOffset(to, { align: "start" })
  })

  // Scroll to the initial anchor once. anchorWeekIndex is NOT a dep — it shifts when
  // weeks are prepended/appended and we don't want to jump back then. Still call
  // measure() on rowHeight/virtualizer changes because tanstack-virtual memoizes item sizes.
  const hasInitialized = useRef(false)
  const ignoreScrollUntil = useRef(0)
  const prevScrollTopRef = useRef<number | null>(null)

  useEffect(() => {
    virtualizer.measure()

    if (hasInitialized.current) return

    const idx = anchorWeekIndexRef.current

    if (idx < 0) return

    debugMonthScroll("initial anchor scroll", { idx, rowHeight })

    virtualizer.scrollToIndex(idx, { align: "start" })

    hasInitialized.current = true
    ignoreScrollUntil.current = Date.now() + 200
    prevScrollTopRef.current = null
  }, [virtualizer, rowHeight])

  // During explicit navigation, scroll the active week fully into view if needed.
  // Scroll-follow updates activeDate without setting isNavigating, so this only runs for
  // deliberate jumps such as clicks, shortcuts, and minical navigation.
  useEffect(() => {
    if (!hasInitialized.current || !isNavigating()) return

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
  }, [activeDateKey, weeks, virtualizer, isNavigating, scrollRef])

  // As the user scrolls, follow the active date to the dominant month (see
  // docs/scroll-behaviour.md). useEffectEvent so the once-bound scroll listener always
  // sees the latest render's weeks/virtualizer without re-subscribing.
  const onScrollTick = useEffectEvent(() => {
    const el = scrollRef.current
    if (!el) return

    // Ignore the settling scrolls right after the initial programmatic anchor scroll, and
    // never follow while a deliberate navigation is driving the viewport.
    if (Date.now() < ignoreScrollUntil.current || isNavigating() || weeks.length === 0) {
      prevScrollTopRef.current = null
      return
    }

    const viewTop = el.scrollTop
    const viewBottom = viewTop + el.clientHeight
    const prevTop = prevScrollTopRef.current
    const direction: "up" | "down" | null =
      prevTop === null || viewTop === prevTop ? null : viewTop > prevTop ? "down" : "up"
    prevScrollTopRef.current = viewTop

    // The first tick after mount/navigation only establishes the direction baseline.
    if (direction === null) return

    const target = pickActiveMonth({
      virtualItems: virtualizer.getVirtualItems(),
      weeks,
      viewTop,
      viewBottom,
      activeDateKey,
      direction,
    })

    if (target) {
      debugMonthScroll("scroll-follow active month", {
        from: activeDateKey,
        to: formatDateKey(target),
        direction,
      })
      onScrollMonthChange(target)
    }
  })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let rafId: number | null = null
    const handleScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        onScrollTick()
      })
    }

    el.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      el.removeEventListener("scroll", handleScroll)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [scrollRef])

  return (
    <div ref={scrollRef} className="grow overflow-y-auto overflow-x-hidden relative">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={weeks[virtualRow.index][0].dateKey}
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
              weekDays={weeks[virtualRow.index]}
              layout={weekLayouts[virtualRow.index]}
              activeEventKey={activeEventKey}
              selectedEventKey={selectedEventKey}
              activeDateKey={activeDateKey}
              onDayClick={onDayClick}
              onEventClick={onEventClick}
              draftEvent={draftEvent}
              dimmed={dimmed}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
