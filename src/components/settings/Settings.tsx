import { PiArrowsClockwise as SyncIcon } from "react-icons/pi"

import { Button } from "@/components/ui/button"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { AccountSection } from "./AccountSection"

export function Settings() {
  const { reloadCalendars } = useCalendarState()

  return (
    <div className="flex flex-col">
      <AccountSection />

      <Button
        variant="ghost"
        className="justify-start text-muted-foreground"
        onClick={() => reloadCalendars()}
      >
        <SyncIcon className="size-4" />
        Refresh calendars
      </Button>
    </div>
  )
}
