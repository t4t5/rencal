import { cn, type FirstDayOfWeek, useDisplaySettings, useIsDimmed } from "@/sdk"

const WEEKDAY_LABELS: Record<FirstDayOfWeek, string[]> = {
  monday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  sunday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
}

const isWeekendLabel = (label: string) => label === "Sat" || label === "Sun"

export const WeekDayLabels = () => {
  const { firstDayOfWeek } = useDisplaySettings()
  const dimmed = useIsDimmed()

  return (
    <div data-slot="month-weekdays" className="grid grid-cols-7 border-b border-border">
      {WEEKDAY_LABELS[firstDayOfWeek].map((label) => (
        <div
          data-slot="month-weekday"
          data-typography="numerical"
          data-weekend={isWeekendLabel(label) || undefined}
          key={label}
          className={cn(
            "text-2xs text-muted-foreground py-2 text-center font-medium uppercase",
            isWeekendLabel(label) && "bg-weekend",
            dimmed && "opacity-50",
          )}
        >
          {label}
        </div>
      ))}
    </div>
  )
}
