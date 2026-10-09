import { useSettings } from "@/contexts/SettingsContext"

import { weekdayNames } from "@/lib/event-time"
import { cn } from "@/lib/utils"

// ISO weekday indices (0 = Monday … 6 = Sunday) in display order.
const WEEKDAY_ORDER = {
  monday: [0, 1, 2, 3, 4, 5, 6],
  sunday: [6, 0, 1, 2, 3, 4, 5],
} as const

const isWeekend = (isoIndex: number) => isoIndex >= 5

export const WeekDayLabels = ({ dimmed }: { dimmed: boolean }) => {
  const { firstDayOfWeek } = useSettings()
  const names = weekdayNames("short")

  return (
    <div data-slot="month-weekdays" className="grid grid-cols-7 border-b border-border">
      {WEEKDAY_ORDER[firstDayOfWeek].map((isoIndex) => (
        <div
          data-slot="month-weekday"
          data-typography="numerical"
          data-weekend={isWeekend(isoIndex) || undefined}
          key={isoIndex}
          className={cn(
            "text-2xs text-muted-foreground py-2 text-center font-medium uppercase",
            isWeekend(isoIndex) && "bg-weekend",
            dimmed && "opacity-50",
          )}
        >
          {names[isoIndex]}
        </div>
      ))}
    </div>
  )
}
