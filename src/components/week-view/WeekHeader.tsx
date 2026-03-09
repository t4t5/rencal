import { format } from "date-fns"

import type { AllDayLaneItem } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { cn } from "@/lib/utils"

import { WeekAllDayBar } from "./WeekAllDayBar"

type WeekHeaderProps = {
  weekDays: MonthDay[]
  allDayItems: AllDayLaneItem[]
  maxAllDayLane: number
  activeEventId: string | null
  onEventClick: (id: string) => void
}

export function WeekHeader({
  weekDays,
  allDayItems,
  maxAllDayLane,
  activeEventId,
  onEventClick,
}: WeekHeaderProps) {
  const hasAllDay = allDayItems.length > 0

  return (
    <div className="border-b border-border shrink-0">
      {/* Day labels row */}
      <div className="grid grid-cols-[52px_repeat(7,1fr)]">
        {/* Gutter spacer */}
        <div />

        {weekDays.map((day) => (
          <div
            key={day.dateKey}
            className={cn(
              "flex flex-col items-center py-1.5 border-r border-border",
              day.isWeekend && "bg-weekendBg",
            )}
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
      </div>

      {/* All-day events zone */}
      {hasAllDay && (
        <div className="relative grid grid-cols-[52px_repeat(7,1fr)]">
          {/* Gutter spacer */}
          <div style={{ minHeight: (maxAllDayLane + 1) * 20 + 4 }} />

          {/* Background columns with borders */}
          {weekDays.map((day) => (
            <div
              key={day.dateKey}
              className={cn("border-r border-border", day.isWeekend && "bg-weekendBg")}
            />
          ))}

          {/* All-day event bars overlaid */}
          <div
            className="absolute top-0 bottom-0 right-0 grid grid-cols-7 py-0.5"
            style={{
              left: 52,
              gridTemplateRows: `repeat(${maxAllDayLane + 1}, minmax(18px, auto))`,
            }}
          >
            {allDayItems.map((item) => (
              <WeekAllDayBar
                key={item.event.id}
                item={item}
                isActive={activeEventId === item.event.id}
                onClick={() => onEventClick(item.event.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
