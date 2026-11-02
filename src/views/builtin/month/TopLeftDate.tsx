import { cn, dayProps, formatMonth } from "@/sdk"

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
          // Fades while the user types a new event in the header.
          "pointer-events-none text-xs w-5 h-5 flex items-center justify-center in-data-dimmed:opacity-50",
          day.isToday && "bg-today text-today-foreground rounded-circle",
          isActive && !day.isToday && "bg-selected text-selected-foreground rounded-circle",
        )}
      >
        {day.date.day}
      </span>
    </div>
  )
}
