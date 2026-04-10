import { useVirtualizer } from "@tanstack/react-virtual"
import { format } from "date-fns"
import { memo, RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import { MonthAllDayBar } from "@/components/month-view/MonthAllDayBar"
import { MonthDayCell } from "@/components/month-view/MonthDayCell"

import type { CalendarEvent } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"

import type { WeekLayout } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { isDeclinedEvent, isPendingEvent } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

const MAX_ALL_DAY_LANES = 3

type MonthWeekRowProps = {
  weekDays: MonthDay[]
  layout: WeekLayout
  activeEventId: string | null
  activeDateKey: string
  onDayClick: (date: Date) => void
  onEventClick: (eventId: string) => void
  draftEvent: CalendarEvent | null
}

const MonthWeekRow = memo(function MonthWeekRow({
  weekDays,
  layout,
  activeEventId,
  activeDateKey,
  onDayClick,
  onEventClick,
  draftEvent,
}: MonthWeekRowProps) {
  const { calendars } = useCalendars()
  const visibleAllDay = layout.allDayItems.filter((item) => item.lane < MAX_ALL_DAY_LANES)
  const visibleLaneCount = Math.min(layout.maxLane + 1, MAX_ALL_DAY_LANES)

  return (
    <>
      {/* Day numbers row */}
      <div className="grid grid-cols-7">
        {weekDays.map((day) => {
          const isActive = day.dateKey === activeDateKey
          return (
            <div
              key={day.dateKey}
              className={cn(
                "flex items-center justify-end gap-1 p-1 pb-0 cursor-default border-r border-border last:border-r-0",
                day.isWeekend && "bg-weekendBg",
                isActive && "bg-buttonSecondaryBgHover",
              )}
              onClick={() => onDayClick(day.date)}
            >
              {day.date.getDate() === 1 && (
                <span className="text-xs text-muted-foreground">{format(day.date, "MMMM")}</span>
              )}
              <span
                className={cn(
                  "text-xs w-5 h-5 flex items-center justify-center",
                  day.isToday && "bg-primary text-primary-foreground rounded-full",
                  isActive && !day.isToday && "bg-secondary rounded-full",
                )}
              >
                {format(day.date, "d")}
              </span>
            </div>
          )
        })}
      </div>

      {/* All-day spanning bars zone */}
      {visibleAllDay.length > 0 && (
        <div
          className="grid grid-cols-7 gap-y-0.5"
          style={{
            gridTemplateRows: `repeat(${visibleLaneCount}, auto)`,
          }}
        >
          {weekDays.map((day, colIndex) => (
            <div
              key={`bg-${day.dateKey}`}
              className={cn(
                "cursor-default",
                colIndex < 6 && "border-r border-border",
                day.isWeekend && "bg-weekendBg",
                day.dateKey === activeDateKey && "bg-buttonSecondaryBgHover",
              )}
              style={{
                gridColumn: colIndex + 1,
                gridRow: `1 / ${visibleLaneCount + 1}`,
              }}
              onClick={() => onDayClick(day.date)}
            />
          ))}
          {visibleAllDay.map((item) => (
            <MonthAllDayBar
              key={item.event.id}
              item={item}
              isActive={item.event.id === activeEventId}
              isPending={isPendingEvent(item.event, calendars)}
              isDeclined={isDeclinedEvent(item.event, calendars)}
              isDraft={item.event === draftEvent}
              onClick={() => onEventClick(item.event.id)}
            />
          ))}
        </div>
      )}

      {/* Day cells with timed events */}
      <div className="grid grid-cols-7 grow min-h-0 overflow-hidden">
        {weekDays.map((day, colIndex) => {
          const allDayOnDay = layout.allDayItems.filter(
            (item) => item.startCol <= colIndex + 1 && item.endCol > colIndex + 1,
          )
          const visibleAllDayOnDay = allDayOnDay.filter((item) => item.lane < MAX_ALL_DAY_LANES)
          const hiddenAllDay = allDayOnDay.length - visibleAllDayOnDay.length

          return (
            <MonthDayCell
              key={day.dateKey}
              day={day}
              timedEvents={layout.timedByCol[colIndex]}
              hiddenAllDayCount={hiddenAllDay}
              activeEventId={activeEventId}
              isActiveDay={day.dateKey === activeDateKey}
              onClick={() => onDayClick(day.date)}
              onEventClick={onEventClick}
              draftEvent={draftEvent}
            />
          )
        })}
      </div>
    </>
  )
})

type MonthGridProps = {
  weeks: MonthDay[][]
  weekLayouts: WeekLayout[]
  activeEventId: string | null
  activeDateKey: string
  anchorWeekIndex: number
  scrollRef: RefObject<HTMLDivElement | null>
  isNavigating: () => boolean
  onDayClick: (date: Date) => void
  onEventClick: (eventId: string) => void
  onScrollMonthChange: (date: Date) => void
  draftEvent: CalendarEvent | null
}

export function MonthGrid({
  weeks,
  weekLayouts,
  activeEventId,
  activeDateKey,
  anchorWeekIndex,
  scrollRef,
  isNavigating,
  onDayClick,
  onEventClick,
  onScrollMonthChange,
  draftEvent,
}: MonthGridProps) {
  const hasInitialized = useRef(false)
  const scrollDetectionReady = useRef(false)
  const [rowHeight, setRowHeight] = useState(150)

  // Track container height to compute row height (1/6 of visible area)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const update = () => {
      const h = el.clientHeight
      if (h > 0) setRowHeight(Math.round(h / 6))
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

  // Compensate scroll position when weeks are prepended so the view stays in place.
  // Track the first week's dateKey — if it changes with more weeks, items were prepended.
  const prevFirstDateKeyRef = useRef(weeks[0]?.[0]?.dateKey)
  const prevWeekCountRef = useRef(weeks.length)

  useLayoutEffect(() => {
    const curFirstKey = weeks[0]?.[0]?.dateKey
    const prevFirstKey = prevFirstDateKeyRef.current
    const prevCount = prevWeekCountRef.current

    prevFirstDateKeyRef.current = curFirstKey
    prevWeekCountRef.current = weeks.length

    // Only adjust when weeks were prepended (first key changed & count grew)
    if (curFirstKey === prevFirstKey || weeks.length <= prevCount) return

    const addedWeeks = weeks.length - prevCount
    const offset = addedWeeks * rowHeight
    virtualizer.scrollToOffset((virtualizer.scrollOffset ?? 0) + offset, { align: "start" })
  })

  // Scroll to anchor week on mount, and re-scroll when rowHeight changes
  // (ResizeObserver may update rowHeight after mount, shifting virtualizer
  // positions and leaving the view at the wrong offset).
  // NOTE: anchorWeekIndex is NOT a dependency — it shifts when weeks are
  // prepended/appended and we don't want to jump back to the anchor then.
  const anchorWeekIndexRef = useRef(anchorWeekIndex)
  anchorWeekIndexRef.current = anchorWeekIndex

  useEffect(() => {
    const idx = anchorWeekIndexRef.current
    if (idx < 0) return
    virtualizer.scrollToIndex(idx, { align: "start" })

    if (!hasInitialized.current) {
      hasInitialized.current = true
    }

    // Delay enabling scroll detection so the scroll settles
    scrollDetectionReady.current = false
    setTimeout(() => {
      scrollDetectionReady.current = true
    }, 200)
  }, [virtualizer, rowHeight])

  // Scroll to active date's week during explicit navigation, but only if not already visible
  useEffect(() => {
    if (!hasInitialized.current) return
    if (!isNavigating()) return
    const el = scrollRef.current
    if (!el) return

    const weekIndex = weeks.findIndex((week) => week.some((d) => d.dateKey === activeDateKey))
    if (weekIndex < 0) return

    // Use virtualizer's measured positions (not rowHeight estimate) for accurate check
    const item = virtualizer.getVirtualItems().find((v) => v.index === weekIndex)
    if (item) {
      const viewStart = el.scrollTop
      const viewEnd = viewStart + el.clientHeight
      if (item.start >= viewStart && item.start + item.size <= viewEnd) return
    }

    virtualizer.scrollToIndex(weekIndex, { align: "start" })
  }, [activeDateKey, weeks, virtualizer, isNavigating, scrollRef])

  // Detect dominant visible month while scrolling and update active date
  // Uses refs for frequently-changing values to avoid listener churn
  const scrollStateRef = useRef({ weeks, activeDateKey })
  scrollStateRef.current = { weeks, activeDateKey }
  const virtualizerRef = useRef(virtualizer)
  virtualizerRef.current = virtualizer

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let rafId: number | null = null

    const handleScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (!scrollDetectionReady.current || isNavigating()) return

        const { weeks: w, activeDateKey: adk } = scrollStateRef.current
        if (w.length === 0) return

        const viewTop = el.scrollTop
        const viewBottom = viewTop + el.clientHeight
        const items = virtualizerRef.current.getVirtualItems()

        // Count visible days per month, weighted by each row's visibility fraction
        const monthCounts = new Map<string, number>()
        for (const item of items) {
          if (item.end <= viewTop || item.start >= viewBottom) continue
          const week = w[item.index]
          if (!week) continue
          const visibleTop = Math.max(item.start, viewTop)
          const visibleBottom = Math.min(item.end, viewBottom)
          const fraction = (visibleBottom - visibleTop) / item.size
          for (const day of week) {
            const key = `${day.date.getFullYear()}-${day.date.getMonth()}`
            monthCounts.set(key, (monthCounts.get(key) ?? 0) + fraction)
          }
        }

        // Only switch away from the active month when another month exceeds it
        const activeYear = parseInt(adk.slice(0, 4))
        const activeMonth = parseInt(adk.slice(5, 7)) - 1 // 0-based
        const activeKey = `${activeYear}-${activeMonth}`
        const activeCount = monthCounts.get(activeKey) ?? 0

        let bestYear = activeYear
        let bestMonth = activeMonth
        let bestCount = activeCount
        for (const [key, count] of monthCounts) {
          if (count > bestCount) {
            bestCount = count
            const parts = key.split("-")
            bestYear = Number(parts[0])
            bestMonth = Number(parts[1])
          }
        }

        if (bestYear !== activeYear || bestMonth !== activeMonth) {
          onScrollMonthChange(new Date(bestYear, bestMonth, 1))
        }
      })
    }

    el.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      el.removeEventListener("scroll", handleScroll)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [scrollRef, isNavigating, onScrollMonthChange])

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
            className="flex flex-col border-b border-border"
          >
            <MonthWeekRow
              weekDays={weeks[virtualRow.index]}
              layout={weekLayouts[virtualRow.index]}
              activeEventId={activeEventId}
              activeDateKey={activeDateKey}
              onDayClick={onDayClick}
              onEventClick={onEventClick}
              draftEvent={draftEvent}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
