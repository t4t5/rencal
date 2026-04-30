import { ReactNode } from "react"

import { InputGroupAddon } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

import { Calendar } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"

import { getCalendarColor } from "@/lib/calendar-styles"
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

  const editableCalendars = calendars.filter((cal) => !cal.read_only)

  return (
    <Select value={calendar?.slug} onValueChange={onChange}>
      <SelectTrigger className={cn("w-full pl-0", readOnly && "pointer-events-none")}>
        {calendar ? <CalendarItem calendar={calendar} /> : <span>Select Calendar</span>}
      </SelectTrigger>
      <SelectContent>
        {editableCalendars.map((cal) => (
          <SelectItem key={cal.slug} value={cal.slug}>
            <CalendarItem calendar={cal} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function CalendarItem({ calendar, children }: { calendar: Calendar; children?: ReactNode }) {
  const { name, slug } = calendar

  return (
    <div className="flex items-center justify-between group max-w-full min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <InputGroupAddon>
          <div
            className="size-3 rounded-xs shrink-0"
            style={{ backgroundColor: getCalendarColor(calendar) }}
          />
        </InputGroupAddon>
        <span className="text-sm text-foreground truncate">{name || slug}</span>
      </div>

      {children}
    </div>
  )
}
