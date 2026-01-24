import { FaFolder as FolderIcon } from "react-icons/fa"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { CalendarItemWithVisibilityToggle } from "./CalendarItem"

// For caldir, we show all calendars from ~/calendar/*
// There's no concept of "accounts" - calendars are local directories
export function AccountSection() {
  const { calendars } = useCalendarState()

  if (calendars.length === 0) {
    return (
      <div className="p-3 text-sm text-muted-foreground">No calendars found in ~/calendar/</div>
    )
  }

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <FolderIcon className="size-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">~/calendar/</span>
      </div>

      <div className="flex flex-col gap-3">
        {calendars.map((calendar) => {
          return <CalendarItemWithVisibilityToggle key={calendar.slug} calendar={calendar} />
        })}
      </div>
    </div>
  )
}
