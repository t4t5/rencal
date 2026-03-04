import { ReactNode } from "react"
import { PiEyeClosed as EyeClosedIcon, PiEye as EyeIcon } from "react-icons/pi"

import { Calendar } from "@/rpc/bindings"

import { cn } from "@/lib/utils"

const DEFAULT_CALENDAR_COLOR = "#888"

export function CalendarItem({ calendar, children }: { calendar: Calendar; children?: ReactNode }) {
  const { name, color } = calendar
  const isVisible = true // TODO: STORE THIS IN RENCAL'S OWN STORE

  return (
    <div
      className={cn("flex items-center justify-between group", {
        "opacity-40": !isVisible,
      })}
    >
      <div className="flex items-center gap-3">
        <div
          className="size-3 rounded-[3px] shrink-0"
          style={{ backgroundColor: color ?? DEFAULT_CALENDAR_COLOR }}
        />
        <span className="text-sm text-primary-foreground">{name}</span>
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
