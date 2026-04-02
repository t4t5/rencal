import { CalendarItem } from "@/components/settings/CalendarItem"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

import { Calendar } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"

import { cn } from "@/lib/utils"

export const CalendarSelect = ({
  calendar,
  onChange,
  readOnly,
}: {
  calendar?: Calendar
  onChange: (calendarId: string) => void
  readOnly?: boolean
}) => {
  const { calendars } = useCalendars()

  return (
    <Select onValueChange={onChange}>
      <SelectTrigger className={cn("w-full", readOnly && "pointer-events-none")}>
        {calendar ? <CalendarItem calendar={calendar} /> : <span>Select Calendar</span>}
      </SelectTrigger>
      <SelectContent>
        {calendars.map((cal) => (
          <SelectItem key={cal.slug} value={cal.slug}>
            <CalendarItem calendar={cal} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
