import { Temporal } from "@js-temporal/polyfill"
import type { PointerEvent as ReactPointerEvent } from "react"

import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { formatMonth } from "@/lib/event-time"
import { cn } from "@/lib/utils"

export function TopLeftDate({
  day,
  isActive,
  dimmed,
  onClick,
  startCreateDrag,
}: {
  day: MonthDay
  isActive: boolean
  dimmed: boolean
  onClick: () => void
  startCreateDrag: (day: Temporal.PlainDate, event: ReactPointerEvent<HTMLElement>) => void
}) {
  return (
    <div
      data-slot="month-date"
      data-typography="numerical"
      data-active={isActive || undefined}
      className={cn(
        // Date alignment belongs to the calendar layout, not the active theme.
        "flex items-center justify-end gap-1 p-1 cursor-default border-r border-border last:border-r-0",
        day.isWeekend && "bg-weekend",
        isActive && "bg-selected",
      )}
      data-drop-day={day.dateKey}
      data-drop-zone="day"
      onClick={onClick}
      onPointerDown={(event) => startCreateDrag(day.date, event)}
    >
      {day.date.day === 1 && (
        <span className="pointer-events-none text-xs text-muted-foreground">
          {formatMonth(day.date, "long")}
        </span>
      )}
      <span
        data-slot="month-day-number"
        data-today={day.isToday || undefined}
        className={cn(
          "pointer-events-none text-xs w-5 h-5 flex items-center justify-center",
          day.isToday && "bg-today text-primary-foreground rounded-circle",
          isActive && !day.isToday && "bg-selected rounded-circle",
          dimmed && "opacity-50",
        )}
      >
        {day.date.day}
      </span>
    </div>
  )
}
