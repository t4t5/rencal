import { eq } from "drizzle-orm"
import { PiEyeClosed as EyeClosedIcon, PiEye as EyeIcon } from "react-icons/pi"

import { useCalendar } from "@/contexts/CalendarContext"

import { cn } from "@/lib/utils"

import { db, schema } from "@/db/database"
import { Calendar } from "@/db/types"

export function CalendarItem({ calendar }: { calendar: Calendar }) {
  const { name, color, isVisible } = calendar
  const { reloadCalendars } = useCalendar()

  const onToggleVisibility = async () => {
    await db
      .update(schema.calendars)
      .set({ isVisible: !isVisible })
      .where(eq(schema.calendars.id, calendar.id))

    await reloadCalendars()
  }

  return (
    <div
      className={cn("flex items-center justify-between py-1.5 group", {
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

      <div className="cursor-pointer" onClick={onToggleVisibility}>
        {isVisible ? (
          <EyeIcon className="size-4 opacity-0 group-hover:opacity-50" />
        ) : (
          <EyeClosedIcon className="size-4 text-muted-foreground" />
        )}
      </div>
    </div>
  )
}
