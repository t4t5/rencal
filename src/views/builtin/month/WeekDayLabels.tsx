import { cn, useDisplaySettings, weekdayNames } from "@/sdk"

// ISO weekday indices (0 = Monday … 6 = Sunday) in display order.
const WEEKDAY_ORDER = {
  monday: [0, 1, 2, 3, 4, 5, 6],
  sunday: [6, 0, 1, 2, 3, 4, 5],
} as const

const isWeekend = (isoIndex: number) => isoIndex >= 5

export const WeekDayLabels = () => {
  const { firstDayOfWeek } = useDisplaySettings()
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
            // Fades while the user types a new event in the header.
            "text-2xs text-muted-foreground py-2 text-center font-medium uppercase in-data-dimmed:opacity-50",
            isWeekend(isoIndex) && "bg-weekend",
          )}
        >
          {names[isoIndex]}
        </div>
      ))}
    </div>
  )
}
