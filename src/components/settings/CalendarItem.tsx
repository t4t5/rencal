import { ReactNode } from "react"
import { PiEyeClosed as EyeClosedIcon, PiEye as EyeIcon } from "react-icons/pi"

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

export function CalendarItemWithVisibilityToggle({ calendar }: { calendar: Calendar }) {
  const isVisible = true // TODO: STORE THIS IN RENCAL'S OWN STORE

  const onToggleVisibility = async (_calendarSlug: string) => {
    // TODO: Implement visibility toggle using local DB keyed by calendar slug
  }

  return (
    <CalendarItem key={calendar.slug} calendar={calendar}>
      <div className="cursor-pointer" onClick={() => onToggleVisibility(calendar.slug)}>
        {isVisible ? (
          <EyeIcon className="size-4 opacity-0 group-hover:opacity-50" />
        ) : (
          <EyeClosedIcon className="size-4 text-muted-foreground" />
        )}
      </div>
    </CalendarItem>
  )
}
