import { ReactNode } from "react"

import { Calendar } from "@/rpc/bindings"

import { getCalendarColor } from "@/lib/calendar-styles"
import { cn } from "@/lib/utils"

export function CalendarItem({ calendar, children }: { calendar: Calendar; children?: ReactNode }) {
  const { name } = calendar
  const isVisible = true // TODO: STORE THIS IN RENCAL'S OWN STORE

  return (
    <div
      className={cn("flex items-center justify-between group max-w-full", {
        "opacity-40": !isVisible,
      })}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="size-3 rounded-xs shrink-0"
          style={{ backgroundColor: getCalendarColor(calendar) }}
        />
        <span className="text-sm text-primary-foreground truncate">{name}</span>
      </div>

      {children}
    </div>
  )
}
