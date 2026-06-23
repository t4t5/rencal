import { useVirtualizer } from "@tanstack/react-virtual"
import { RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import type { WeekLayout } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import type { CalendarEvent } from "@/lib/cal-events"
import { isDebugMode } from "@/lib/debug"
import { formatDateKey } from "@/lib/event-time"

import { MonthWeekRow } from "./Row"

const DEFAULT_ROW_HEIGHT = 150
const DEBUG_MONTH_SCROLL = isDebugMode("month-scroll")
export const LANE_HEIGHT = 20
export const LANE_GAP = 3

function debugMonthScroll(message: string, data?: Record<string, unknown>) {
  if (!DEBUG_MONTH_SCROLL) return
  console.debug(`[MonthScroll] ${message}`, data ?? {})
}

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

  // Give stable callbacks access to the latest render's values
  const latestRef = useRef({
    weeks,
    activeDateKey,
    anchorWeekIndex,
    virtualizer,
    isNavigating,
    onScrollMonthChange,
  })

  latestRef.current = {
    weeks,
    activeDateKey,
    anchorWeekIndex,
    virtualizer,
    isNavigating,
    onScrollMonthChange,
  }

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

    const idx = latestRef.current.anchorWeekIndex
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

  // As the user scrolls, pick the dominant month in the viewport and bubble it up.
  // Stay on the active month unless another has strictly more visible area.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let rafId: number | null = null
    const handleScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (Date.now() < ignoreScrollUntil.current) {
          prevScrollTopRef.current = null
          return
        }
        const {
          weeks: w,
          activeDateKey: adk,
          virtualizer: v,
          isNavigating: isNav,
          onScrollMonthChange: onChange,
        } = latestRef.current
        if (isNav() || w.length === 0) {
          prevScrollTopRef.current = null
          return
        }

        const viewTop = el.scrollTop
        const viewBottom = viewTop + el.clientHeight
        const prevTop = prevScrollTopRef.current
        const direction: "up" | "down" | null =
          prevTop === null || viewTop === prevTop ? null : viewTop > prevTop ? "down" : "up"
        prevScrollTopRef.current = viewTop
        // No baseline yet (first tick after mount or after a navigation/ignore window).
        // Establish it now and skip emission so the next tick can be guarded.
        if (direction === null) return
        const monthCounts = new Map<string, number>()
        // Track the 1st of each month that's currently in the viewport. We only navigate when
        // the 1st is visible, so both scroll directions land on day 1 of the new month.
        const monthFirstDay = new Map<string, Date>()
        for (const item of v.getVirtualItems()) {
          const top = Math.max(item.start, viewTop)
          const bottom = Math.min(item.end, viewBottom)
          if (bottom <= top) continue
          const fraction = (bottom - top) / item.size
          const week = w[item.index]
          if (!week) continue
          for (const day of week) {
            const key = `${day.date.getFullYear()}-${day.date.getMonth()}`
            monthCounts.set(key, (monthCounts.get(key) ?? 0) + fraction)
            if (day.date.getDate() === 1) monthFirstDay.set(key, day.date)
          }
        }

        const activeKey = `${adk.slice(0, 4)}-${Number(adk.slice(5, 7)) - 1}`
        let bestKey = activeKey
        let bestCount = monthCounts.get(activeKey) ?? 0
        for (const [key, count] of monthCounts) {
          if (count > bestCount) {
            bestKey = key
            bestCount = count
          }
        }
        if (bestKey !== activeKey) {
          const target = monthFirstDay.get(bestKey)
          // If the 1st of bestKey isn't in a fully visible row yet, wait for a later
          // tick. Scroll-follow should never promote a half-clipped row to active.
          if (target) {
            const targetKey = formatDateKey(target)
            if (direction === "up" && targetKey > adk) return
            if (direction === "down" && targetKey < adk) return

            const targetItem = v
              .getVirtualItems()
              .find((item) => w[item.index]?.some((day) => day.dateKey === targetKey))
            if (!targetItem || targetItem.start < viewTop || targetItem.end > viewBottom) return

            debugMonthScroll("scroll-follow active month", {
              from: adk,
              to: targetKey,
              direction,
            })
            onChange(target)
          }
        }
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
