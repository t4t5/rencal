import { cn, dayProps, formatMonth, useIsDimmed } from "@/sdk"

import type { MonthDay } from "./useMonthGrid"

export function TopLeftDate({
  day,
  isActive,
  onClick,
}: {
  day: MonthDay
  isActive: boolean
  onClick: () => void
}) {
  const dimmed = useIsDimmed()

  return (
    <div
      data-slot="month-day-header"
      data-typography="numerical"
      data-selected={isActive || undefined}
      data-weekend={day.isWeekend || undefined}
      className={cn(
        // Date alignment belongs to the calendar layout, not the active theme.
        "flex items-center justify-end gap-1 p-1 cursor-default border-r border-border last:border-r-0",
        day.isWeekend && "bg-weekend",
        isActive && "bg-selected text-selected-foreground",
      )}
      {...dayProps(day.date, "day")}
      onClick={onClick}
    >
      {(day.date.day === 1 || isActive) && (
        <span className="pointer-events-none text-xs text-muted-foreground">
          {formatMonth(day.date, "long")}
        </span>
      )}
      <span
        data-slot="month-day-number"
        data-today={day.isToday || undefined}
        className={cn(
          "pointer-events-none text-xs w-5 h-5 flex items-center justify-center",
          day.isToday && "bg-today text-today-foreground rounded-circle",
          isActive && !day.isToday && "bg-selected text-selected-foreground rounded-circle",
          dimmed && "opacity-50",
        )}
      >
        {day.date.day}
      </span>
    </div>
  )
}
