import { useSettings } from "@/contexts/SettingsContext"

import type { FirstDayOfWeek } from "@/lib/event-time"
import { cn } from "@/lib/utils"

const WEEKDAY_LABELS: Record<FirstDayOfWeek, string[]> = {
  monday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  sunday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
}

export const WeekDayLabels = ({ dimmed }: { dimmed: boolean }) => {
  const { firstDayOfWeek } = useSettings()

  return (
    <div className="grid grid-cols-7 border-b border-divider">
      {WEEKDAY_LABELS[firstDayOfWeek].map((label) => (
        <div
          key={label}
          className={cn(
            "text-[11px]! text-muted-foreground py-2 text-center font-medium numerical uppercase",
            (label === "Sat" || label === "Sun") && "bg-weekend",
            dimmed && "opacity-50",
          )}
        >
          {label}
        </div>
      ))}
    </div>
  )
}
