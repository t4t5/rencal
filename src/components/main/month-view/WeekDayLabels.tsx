import { cn } from "@/lib/utils"

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export const WeekDayLabels = ({ dimmed }: { dimmed: boolean }) => {
  return (
    <div className="grid grid-cols-7 border-b border-divider">
      {WEEKDAY_LABELS.map((label, i) => (
        <div
          key={label}
          className={cn(
            "text-[11px]! text-muted-foreground py-2 text-center font-medium font-numerical uppercase",
            i >= 5 && "bg-weekend",
            dimmed && "opacity-50",
          )}
        >
          {label}
        </div>
      ))}
    </div>
  )
}
