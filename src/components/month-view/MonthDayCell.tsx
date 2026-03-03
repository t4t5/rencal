import { MonthTimedEvent } from "@/components/month-view/MonthTimedEvent"

import type { TimedEventItem } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { cn } from "@/lib/utils"

const MAX_TIMED_VISIBLE = 2

type MonthDayCellProps = {
  day: MonthDay
  timedEvents: TimedEventItem[]
  hiddenAllDayCount: number
  activeEventId: string | null
  isActiveDay: boolean
  onClick: () => void
  onEventClick: (eventId: string) => void
}

export function MonthDayCell({
  day,
  timedEvents,
  hiddenAllDayCount,
  activeEventId,
  isActiveDay,
  onClick,
  onEventClick,
}: MonthDayCellProps) {
  const visibleTimed = timedEvents.slice(0, MAX_TIMED_VISIBLE)
  const hiddenTimedCount = timedEvents.length - visibleTimed.length
  const totalHidden = hiddenAllDayCount + hiddenTimedCount

  return (
    <div
      className={cn(
        "flex flex-col gap-px px-1 pb-1 min-h-0 overflow-hidden cursor-default border-r border-border last:border-r-0",
        day.isWeekend && "bg-weekendBg",
        isActiveDay && "bg-secondary",
      )}
      onClick={onClick}
    >
      {visibleTimed.map((item) => (
        <MonthTimedEvent
          key={item.event.id}
          item={item}
          isActive={item.event.id === activeEventId}
          onClick={() => onEventClick(item.event.id)}
        />
      ))}

      {totalHidden > 0 && (
        <div className="text-xs text-muted-foreground px-0.5 truncate shrink-0">
          +{totalHidden} more
        </div>
      )}
    </div>
  )
}
