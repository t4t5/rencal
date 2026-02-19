import { format } from "date-fns"

import { MonthTimedEvent } from "@/components/month-view/MonthTimedEvent"

import type { TimedEventItem } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { cn } from "@/lib/utils"

const MAX_TIMED_VISIBLE = 2

type MonthDayCellProps = {
  day: MonthDay
  timedEvents: TimedEventItem[]
  hiddenAllDayCount: number
  onClick: () => void
  onEventClick: (eventId: string) => void
}

export function MonthDayCell({
  day,
  timedEvents,
  hiddenAllDayCount,
  onClick,
  onEventClick,
}: MonthDayCellProps) {
  const visibleTimed = timedEvents.slice(0, MAX_TIMED_VISIBLE)
  const hiddenTimedCount = timedEvents.length - visibleTimed.length
  const totalHidden = hiddenAllDayCount + hiddenTimedCount

  return (
    <div
      className={cn(
        "flex flex-col gap-px p-1 min-h-0 overflow-hidden cursor-default border-r border-border last:border-r-0",
        day.isWeekend && "bg-weekendBg",
        !day.isCurrentMonth && "opacity-40",
      )}
      onClick={onClick}
    >
      <div className="flex justify-end">
        <span
          className={cn(
            "text-xs w-5 h-5 flex items-center justify-center",
            day.isToday && "bg-primary text-primary-foreground rounded-full",
          )}
        >
          {format(day.date, "d")}
        </span>
      </div>

      {visibleTimed.map((item) => (
        <MonthTimedEvent
          key={item.event.id}
          item={item}
          onClick={() => onEventClick(item.event.id)}
        />
      ))}

      {totalHidden > 0 && (
        <div className="text-xs text-muted-foreground px-0.5 truncate">+{totalHidden} more</div>
      )}
    </div>
  )
}
