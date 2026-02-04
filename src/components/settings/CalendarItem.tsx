import { eq } from "drizzle-orm"
import { ReactNode } from "react"
import { PiEyeClosed as EyeClosedIcon, PiEye as EyeIcon } from "react-icons/pi"

import { Calendar } from "@/rpc/bindings"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { cn } from "@/lib/utils"

import { db, schema } from "@/db/database"

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
          style={{ backgroundColor: color ?? undefined }}
        />
        {/*isSubscription ? (
          <RssIcon className="size-3 shrink-0" style={{ color }} />
        ) : (
          <div className="size-3 rounded-[3px] shrink-0" style={{ backgroundColor: color }} />
        )*/}
        <span className="text-sm">{name}</span>
      </div>

      {children}
    </div>
  )
}

export function CalendarItemWithVisibilityToggle({ calendar }: { calendar: Calendar }) {
  const { reloadCalendars } = useCalendarState()

  const isVisible = true
  // const { isVisible } = calendar

  const onToggleVisibility = async (calendarId: string) => {
    await db
      .update(schema.calendars)
      .set({ isVisible: !isVisible })
      .where(eq(schema.calendars.id, calendarId))

    await reloadCalendars()
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
