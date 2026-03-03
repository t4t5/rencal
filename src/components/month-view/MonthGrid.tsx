import { useVirtualizer } from "@tanstack/react-virtual"
import { format } from "date-fns"
import { memo, RefObject, useCallback, useEffect, useRef, useState } from "react"

import { MonthAllDayBar } from "@/components/month-view/MonthAllDayBar"
import { MonthDayCell } from "@/components/month-view/MonthDayCell"

import type { WeekLayout } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { cn } from "@/lib/utils"

const MAX_ALL_DAY_LANES = 3

type MonthWeekRowProps = {
  weekDays: MonthDay[]
  layout: WeekLayout
  activeEventId: string | null
  activeDateKey: string
  onDayClick: (date: Date) => void
  onEventClick: (eventId: string) => void
}

const MonthWeekRow = memo(function MonthWeekRow({
  weekDays,
  layout,
  activeEventId,
  activeDateKey,
  onDayClick,
  onEventClick,
}: MonthWeekRowProps) {
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
                isActive && "bg-secondary",
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
                colIndex < 6 && "border-r border-border",
                day.isWeekend && "bg-weekendBg",
                day.dateKey === activeDateKey && "bg-secondary",
              )}
              style={{
                gridColumn: colIndex + 1,
                gridRow: `1 / ${visibleLaneCount + 1}`,
              }}
            />
          ))}
          {visibleAllDay.map((item) => (
            <MonthAllDayBar
              key={item.event.id}
              item={item}
              isActive={item.event.id === activeEventId}
              onClick={() => onEventClick(item.event.id)}
            />
          ))}
        </div>
      )}

      {/* Day cells with timed events */}
      <div className="grid grid-cols-7 grow">
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

  // Scroll to anchor week on mount
  useEffect(() => {
    if (hasInitialized.current) return
    if (anchorWeekIndex >= 0) {
      virtualizer.scrollToIndex(anchorWeekIndex, { align: "start" })
      hasInitialized.current = true
      // Delay enabling scroll detection so the initial scroll settles
      // and doesn't get misinterpreted as user scrolling
      setTimeout(() => {
        scrollDetectionReady.current = true
      }, 200)
    }
  }, [anchorWeekIndex, virtualizer])

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
  const scrollStateRef = useRef({ weeks, activeDateKey, rowHeight })
  scrollStateRef.current = { weeks, activeDateKey, rowHeight }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let rafId: number | null = null

    const handleScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (!scrollDetectionReady.current || isNavigating()) return

        const { weeks: w, activeDateKey: adk, rowHeight: rh } = scrollStateRef.current
        if (rh <= 0 || w.length === 0) return

        const viewTop = el.scrollTop
        const viewBottom = viewTop + el.clientHeight

        const firstRow = Math.max(0, Math.floor(viewTop / rh))
        const lastRow = Math.min(Math.ceil(viewBottom / rh) - 1, w.length - 1)

        // Count visible days per month
        const monthCounts = new Map<string, number>()
        for (let i = firstRow; i <= lastRow; i++) {
          const week = w[i]
          if (!week) continue
          for (const day of week) {
            const key = `${day.date.getFullYear()}-${day.date.getMonth()}`
            monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1)
          }
        }

        // Find month with the most visible days
        let maxCount = 0
        let dominantYear = 0
        let dominantMonth = 0
        for (const [key, count] of monthCounts) {
          if (count > maxCount) {
            maxCount = count
            const parts = key.split("-")
            dominantYear = Number(parts[0])
            dominantMonth = Number(parts[1])
          }
        }

        if (maxCount === 0) return

        // Only update if the dominant month differs from active date's month
        const activeYear = parseInt(adk.slice(0, 4))
        const activeMonth = parseInt(adk.slice(5, 7)) - 1 // 0-based
        if (dominantYear !== activeYear || dominantMonth !== activeMonth) {
          onScrollMonthChange(new Date(dominantYear, dominantMonth, 1))
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
            />
          </div>
        ))}
      </div>
    </div>
  )
}
