import { useVirtualizer } from "@tanstack/react-virtual"
import { format } from "date-fns"
import { memo, RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import { MonthAllDayEvent } from "@/components/main/month-view/MonthAllDayEvent"
import { MonthDayCell } from "@/components/main/month-view/MonthDayCell"

import type { CalendarEvent } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"

import type { WeekLayout } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { isDeclinedEvent, isPendingEvent } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

const MAX_ALL_DAY_LANES = 3
export const LANE_HEIGHT = 20
export const LANE_GAP = 2

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
}: {
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
}) {
  // Each day cell is a square: row height tracks the column width
  const [rowHeight, setRowHeight] = useState(150)
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
    virtualizer.scrollToOffset((virtualizer.scrollOffset ?? 0) + added * rowHeight, {
      align: "start",
    })
  })

  // Scroll to anchor on mount and when rowHeight changes. anchorWeekIndex is NOT a dep —
  // it shifts when weeks are prepended/appended and we don't want to jump back then.
  const hasInitialized = useRef(false)
  const ignoreScrollUntil = useRef(0)
  useEffect(() => {
    const idx = latestRef.current.anchorWeekIndex
    if (idx < 0) return
    virtualizer.scrollToIndex(idx, { align: "start" })
    hasInitialized.current = true
    ignoreScrollUntil.current = Date.now() + 200
  }, [virtualizer, rowHeight])

  // During explicit navigation, scroll the active week into view if it's offscreen
  useEffect(() => {
    if (!hasInitialized.current || !isNavigating()) return
    const el = scrollRef.current
    if (!el) return

    const weekIndex = weeks.findIndex((week) => week.some((d) => d.dateKey === activeDateKey))
    if (weekIndex < 0) return

    const item = virtualizer.getVirtualItems().find((v) => v.index === weekIndex)
    if (item) {
      const viewStart = el.scrollTop
      const viewEnd = viewStart + el.clientHeight
      if (item.start >= viewStart && item.start + item.size <= viewEnd) return
    }
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
        if (Date.now() < ignoreScrollUntil.current) return
        const {
          weeks: w,
          activeDateKey: adk,
          virtualizer: v,
          isNavigating: isNav,
          onScrollMonthChange: onChange,
        } = latestRef.current
        if (isNav() || w.length === 0) return

        const viewTop = el.scrollTop
        const viewBottom = viewTop + el.clientHeight
        const monthCounts = new Map<string, number>()
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
          const [y, m] = bestKey.split("-").map(Number)
          onChange(new Date(y, m, 1))
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

function TopLeftDate({
  day,
  isActive,
  onClick,
}: {
  day: MonthDay
  isActive: boolean
  onClick: () => void
}) {
  return (
    <div
      className={cn(
        "font-numerical flex items-center justify-end gap-1 p-0 pb-0 cursor-default border-r border-border last:border-r-0",
        day.isWeekend && "bg-weekendBg",
        isActive && "bg-buttonSecondaryBgHover",
      )}
      onClick={onClick}
    >
      {day.date.getDate() === 1 && (
        <span className="text-xs text-muted-foreground">{format(day.date, "MMMM")}</span>
      )}
      <span
        className={cn(
          "text-xs w-5 h-5 flex items-center justify-center",
          day.isToday && "bg-primary text-primary-foreground rounded-circle",
          isActive && !day.isToday && "bg-secondary rounded-circle",
        )}
      >
        {format(day.date, "d")}
      </span>
    </div>
  )
}

const MonthWeekRow = memo(function MonthWeekRow({
  weekDays,
  layout,
  activeEventId,
  activeDateKey,
  onDayClick,
  onEventClick,
  draftEvent,
}: {
  weekDays: MonthDay[]
  layout: WeekLayout
  activeEventId: string | null
  activeDateKey: string
  onDayClick: (date: Date) => void
  onEventClick: (eventId: string) => void
  draftEvent: CalendarEvent | null
}) {
  const { calendars } = useCalendars()
  const visibleAllDay = layout.allDayItems.filter((item) => item.lane < MAX_ALL_DAY_LANES)

  // Per-column reserved lanes: a day only leaves space for all-day bars that actually span it
  const reservedLanes = Array(7).fill(0) as number[]
  for (const item of visibleAllDay) {
    for (let c = item.startCol - 1; c < item.endCol - 1; c++) {
      reservedLanes[c] = Math.max(reservedLanes[c], item.lane + 1)
    }
  }

  return (
    <>
      {/* Day numbers row */}
      <div className="grid grid-cols-7">
        {weekDays.map((day) => (
          <TopLeftDate
            key={day.dateKey}
            day={day}
            isActive={day.dateKey === activeDateKey}
            onClick={() => onDayClick(day.date)}
          />
        ))}
      </div>

      {/* Day cells with all-day bars overlaid */}
      <div className="grid grid-cols-7 grow min-h-0 relative">
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
              reservedAllDayHeight={reservedLanes[colIndex] * LANE_HEIGHT}
              activeEventId={activeEventId}
              isActiveDay={day.dateKey === activeDateKey}
              onClick={() => onDayClick(day.date)}
              onEventClick={onEventClick}
              draftEvent={draftEvent}
            />
          )
        })}
        {visibleAllDay.map((item) => (
          <MonthAllDayEvent
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
    </>
  )
})
