import { ReactNode } from "react"
import { PiEyeClosed as EyeClosedIcon, PiEye as EyeIcon } from "react-icons/pi"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { cn } from "@/lib/utils"

import { Calendar } from "@/db/types"

export function CalendarItem({ calendar, children }: { calendar: Calendar; children?: ReactNode }) {
  const { name, color, isVisible } = calendar

  return (
    <div
      className={cn("flex items-center justify-between group", {
        "opacity-40": !isVisible,
      })}
    >
      <div className="flex items-center gap-3">
        <div
          className="size-3 rounded-[3px] shrink-0"
          style={{ backgroundColor: color ?? undefined }}
        />
        <span className="text-sm">{name}</span>
      </div>

      {children}
    </div>
  )
}

export function CalendarItemWithVisibilityToggle({ calendar }: { calendar: Calendar }) {
  const { toggleCalendarVisibility } = useCalendarState()

  const { isVisible } = calendar

  const onToggleVisibility = () => {
    toggleCalendarVisibility(calendar.slug)
  }

  return (
    <CalendarItem key={calendar.slug} calendar={calendar}>
      <div className="cursor-pointer" onClick={onToggleVisibility}>
        {isVisible ? (
          <EyeIcon className="size-4 opacity-0 group-hover:opacity-50" />
        ) : (
          <EyeClosedIcon className="size-4 text-muted-foreground" />
        )}
      </div>
    </CalendarItem>
  )
}
