import { format } from "date-fns"

import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { cn } from "@/lib/utils"

export function TopLeftDate({
  day,
  isActive,
  dimmed,
  onClick,
}: {
  day: MonthDay
  isActive: boolean
  dimmed: boolean
  onClick: () => void
}) {
  return (
    <div
      className={cn(
        "numerical flex items-center justify-end gap-1 p-1 cursor-default border-r border-divider last:border-r-0",
        day.isWeekend && "bg-weekend",
        isActive && "bg-accent",
      )}
      onClick={onClick}
    >
      {day.date.getDate() === 1 && (
        <span className="text-xs text-muted-foreground">{format(day.date, "MMMM")}</span>
      )}
      <span
        className={cn(
          "text-xs w-5 h-5 flex items-center justify-center",
          day.isToday && "bg-today text-primary-foreground rounded-circle",
          isActive && !day.isToday && "bg-accent rounded-circle",
          dimmed && "opacity-50",
        )}
      >
        {format(day.date, "d")}
      </span>
    </div>
  )
}
