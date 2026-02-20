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
  onDayClick: (date: Date) => void
  onEventClick: (eventId: string) => void
}

const MonthWeekRow = memo(function MonthWeekRow({
  weekDays,
  layout,
  activeEventId,
  onDayClick,
  onEventClick,
}: MonthWeekRowProps) {
  const visibleAllDay = layout.allDayItems.filter((item) => item.lane < MAX_ALL_DAY_LANES)
  const visibleLaneCount = Math.min(layout.maxLane + 1, MAX_ALL_DAY_LANES)

  return (
    <>
      {/* Day numbers row */}
      <div className="grid grid-cols-7">
        {weekDays.map((day) => (
          <div
            key={day.dateKey}
            className={cn(
              "flex justify-end p-1 pb-0 cursor-default border-r border-border last:border-r-0",
              day.isWeekend && "bg-weekendBg",
            )}
            onClick={() => onDayClick(day.date)}
          >
            <span
              className={cn(
                "text-xs w-5 h-5 flex items-center justify-center",
                day.isToday && "bg-primary text-primary-foreground rounded-full",
              )}
            >
              {format(day.date, "d")}
            </span>
          </div>
        ))}
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
  anchorWeekIndex: number
  scrollRef: RefObject<HTMLDivElement | null>
  onDayClick: (date: Date) => void
  onEventClick: (eventId: string) => void
}

export function MonthGrid({
  weeks,
  weekLayouts,
  activeEventId,
  anchorWeekIndex,
  scrollRef,
  onDayClick,
  onEventClick,
}: MonthGridProps) {
  const hasInitialized = useRef(false)
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
    }
  }, [anchorWeekIndex, virtualizer])

  return (
    <div ref={scrollRef} className="grow overflow-y-auto relative">
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
              onDayClick={onDayClick}
              onEventClick={onEventClick}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
