import { CalendarItem } from "@/components/settings/CalendarItem"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

import { Calendar } from "@/rpc/bindings"

import { useCalendarState } from "@/contexts/CalendarStateContext"

export const CalendarSelect = ({
  calendar,
  onChange,
}: {
  calendar?: Calendar
  onChange: (calendarId: string) => void
}) => {
  const { calendars } = useCalendarState()

  return (
    <Select onValueChange={onChange}>
      <SelectTrigger className="w-full">
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
