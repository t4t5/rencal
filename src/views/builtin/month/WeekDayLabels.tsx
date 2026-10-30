import { cn, type FirstDayOfWeek, useDisplaySettings } from "@/sdk"

const WEEKDAY_LABELS: Record<FirstDayOfWeek, string[]> = {
  monday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  sunday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
}

const isWeekendLabel = (label: string) => label === "Sat" || label === "Sun"

export const WeekDayLabels = () => {
  const { firstDayOfWeek } = useDisplaySettings()

  return (
    <div data-slot="month-weekdays" className="grid grid-cols-7 border-b border-border">
      {WEEKDAY_LABELS[firstDayOfWeek].map((label) => (
        <div
          data-slot="month-weekday"
          data-typography="numerical"
          data-weekend={isWeekendLabel(label) || undefined}
          key={label}
          className={cn(
            // Fades while the user types a new event in the header.
            "text-2xs text-muted-foreground py-2 text-center font-medium uppercase in-data-dimmed:opacity-50",
            isWeekendLabel(label) && "bg-weekend",
          )}
        >
          {label}
        </div>
      ))}
    </div>
  )
}
