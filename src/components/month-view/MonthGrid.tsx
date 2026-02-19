import { format } from "date-fns"

import { MonthAllDayBar } from "@/components/month-view/MonthAllDayBar"
import { MonthDayCell } from "@/components/month-view/MonthDayCell"

import type { WeekLayout } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { cn } from "@/lib/utils"

const MAX_ALL_DAY_LANES = 3

type MonthGridProps = {
  weeks: MonthDay[][]
  weekLayouts: WeekLayout[]
  activeEventId: string | null
  onDayClick: (date: Date) => void
  onEventClick: (eventId: string) => void
}

export function MonthGrid({
  weeks,
  weekLayouts,
  activeEventId,
  onDayClick,
  onEventClick,
}: MonthGridProps) {
  return (
    <div className="flex flex-col grow">
      {weeks.map((weekDays, weekIndex) => {
        const layout = weekLayouts[weekIndex]
        const visibleAllDay = layout.allDayItems.filter((item) => item.lane < MAX_ALL_DAY_LANES)
        const visibleLaneCount = Math.min(layout.maxLane + 1, MAX_ALL_DAY_LANES)

        return (
          <div
            key={weekIndex}
            className="flex flex-col grow border-b border-border last:border-b-0 min-h-0"
          >
            {/* Day numbers row */}
            <div className="grid grid-cols-7">
              {weekDays.map((day) => (
                <div
                  key={day.dateKey}
                  className={cn(
                    "flex justify-end p-1 pb-0 cursor-default border-r border-border last:border-r-0",
                    day.isWeekend && "bg-weekendBg",
                    !day.isCurrentMonth && "opacity-40",
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
                {/* Background cells for vertical borders */}
                {weekDays.map((day, colIndex) => (
                  <div
                    key={`bg-${day.dateKey}`}
                    className={cn(
                      colIndex < 6 && "border-r border-border",
                      day.isWeekend && "bg-weekendBg",
                      !day.isCurrentMonth && "opacity-40",
                    )}
                    style={{
                      gridColumn: colIndex + 1,
                      gridRow: `1 / ${visibleLaneCount + 1}`,
                    }}
                  />
                ))}
                {visibleAllDay.map((item) => (
                  <MonthAllDayBar
                    key={`${item.event.id}-w${weekIndex}`}
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
                const visibleAllDayOnDay = allDayOnDay.filter(
                  (item) => item.lane < MAX_ALL_DAY_LANES,
                )
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
          </div>
        )
      })}
    </div>
  )
}
