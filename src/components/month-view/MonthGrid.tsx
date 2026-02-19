import { MonthAllDayBar } from "@/components/month-view/MonthAllDayBar"
import { MonthDayCell } from "@/components/month-view/MonthDayCell"

import type { WeekLayout } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"

const MAX_ALL_DAY_LANES = 3

type MonthGridProps = {
  weeks: MonthDay[][]
  weekLayouts: WeekLayout[]
  onDayClick: (date: Date) => void
  onEventClick: (eventId: string) => void
}

export function MonthGrid({ weeks, weekLayouts, onDayClick, onEventClick }: MonthGridProps) {
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
            {/* All-day spanning bars zone */}
            {visibleAllDay.length > 0 && (
              <div
                className="grid grid-cols-7 gap-0.5"
                style={{
                  gridTemplateRows: `repeat(${visibleLaneCount}, auto)`,
                }}
              >
                {visibleAllDay.map((item) => (
                  <MonthAllDayBar
                    key={`${item.event.id}-w${weekIndex}`}
                    item={item}
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
