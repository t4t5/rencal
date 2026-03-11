import { format } from "date-fns"
import { useEffect, useState } from "react"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import type { AllDayLaneItem } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import type { WeekTimedEventLayout } from "@/hooks/cal-events/useWeekEventLayout"
import { isPendingEvent } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

import { CurrentTimeIndicator } from "./CurrentTimeIndicator"
import { WeekAllDayBar } from "./WeekAllDayBar"
import { WeekTimedEvent } from "./WeekTimedEvent"

type WeekTimeGridProps = {
  weekDays: MonthDay[]
  timedByCol: WeekTimedEventLayout[][]
  allDayItems: AllDayLaneItem[]
  maxAllDayLane: number
  activeEventId: string | null
  activeDateKey: string
  onDayClick: (date: Date) => void
  onEventClick: (id: string) => void
  visibleStartHour: number
  visibleEndHour: number
}

export function WeekTimeGrid({
  weekDays,
  timedByCol,
  allDayItems,
  maxAllDayLane,
  activeEventId,
  activeDateKey,
  onDayClick,
  onEventClick,
  visibleStartHour,
  visibleEndHour,
}: WeekTimeGridProps) {
  const { calendars } = useCalendarState()
  const [, setTick] = useState(0)

  // Update time indicator every 60s
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const rangeHours = visibleEndHour - visibleStartHour

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const rangeStartMin = visibleStartHour * 60
  const rangeMinutes = rangeHours * 60
  const timeIndicatorTopPercent = ((currentMinutes - rangeStartMin) / rangeMinutes) * 100

  const showTimeIndicator = timeIndicatorTopPercent >= 0 && timeIndicatorTopPercent <= 100
  const todayColIndex = weekDays.findIndex((d) => d.isToday)
  const hasAllDay = allDayItems.length > 0

  return (
    <div
      className="grid grid-cols-7 h-full"
      style={{ gridTemplateRows: hasAllDay ? "auto auto 1fr" : "auto 1fr" }}
    >
      {/* Row 1: Day headers */}
      {weekDays.map((day) => (
        <div
          key={day.dateKey}
          className={cn(
            "flex items-baseline justify-end gap-1 border-r border-border px-1 pt-1.5 cursor-default",
            day.dateKey === activeDateKey ? "bg-secondary" : day.isWeekend && "bg-weekendBg",
          )}
          onClick={() => onDayClick(day.date)}
        >
          <span className="text-[10px] text-muted-foreground uppercase">
            {format(day.date, "EEE")}
          </span>
          <span
            className={cn(
              "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
              day.isToday && "bg-primary text-primary-foreground",
            )}
          >
            {format(day.date, "d")}
          </span>
        </div>
      ))}

      {/* Row 2: All-day events (only if present) */}
      {hasAllDay && (
        <div
          className="col-span-7 relative grid grid-cols-7 border-b border-border"
          style={{
            gridTemplateRows: `repeat(${maxAllDayLane + 1}, minmax(18px, auto))`,
          }}
        >
          {/* Background columns for weekend shading + borders */}
          {weekDays.map((day, i) => (
            <div
              key={day.dateKey}
              className={cn(
                "border-r border-border",
                day.dateKey === activeDateKey ? "bg-secondary" : day.isWeekend && "bg-weekendBg",
              )}
              style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
            />
          ))}

          {/* All-day event bars */}
          {allDayItems.map((item) => (
            <WeekAllDayBar
              key={item.event.id}
              item={item}
              isActive={activeEventId === item.event.id}
              isPending={isPendingEvent(item.event, calendars)}
              onClick={() => onEventClick(item.event.id)}
            />
          ))}
        </div>
      )}

      {/* Row 3: Time columns */}
      {weekDays.map((day, colIndex) => (
        <div
          key={day.dateKey}
          className={cn(
            "relative border-r border-border cursor-default",
            day.dateKey === activeDateKey ? "bg-secondary" : day.isWeekend && "bg-weekendBg",
          )}
          onClick={() => onDayClick(day.date)}
        >
          {/* Timed events */}
          {timedByCol[colIndex].map((layout) => (
            <WeekTimedEvent
              key={layout.event.id}
              layout={layout}
              isActive={activeEventId === layout.event.id}
              isPending={isPendingEvent(layout.event, calendars)}
              onClick={() => onEventClick(layout.event.id)}
            />
          ))}

          {/* Current time indicator */}
          {colIndex === todayColIndex && showTimeIndicator && (
            <CurrentTimeIndicator topPercent={timeIndicatorTopPercent} />
          )}
        </div>
      ))}
    </div>
  )
}
