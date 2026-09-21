import { ReactNode } from "react"

import { ControlContent, ControlLeading } from "@/components/ui/control-row"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

import { useCalendars } from "@/contexts/CalendarStateContext"

import type { Calendar } from "@/lib/api"
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
    <Select value={calendar?.slug} onValueChange={onChange} disabled={readOnly}>
      <SelectTrigger
        controlLayout
        className={cn(
          "w-full",
          readOnly && "pointer-events-none disabled:cursor-default disabled:opacity-100",
        )}
      >
        <ControlLeading>
          {calendar && (
            <div
              className="size-3 shrink-0 rounded-xs"
              style={{ backgroundColor: getCalendarColor(calendar) }}
            />
          )}
        </ControlLeading>
        <ControlContent className="truncate text-left text-foreground">
          {calendar ? calendar.name || calendar.slug : "Select Calendar"}
        </ControlContent>
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
    <div className="group flex max-w-full min-w-0 items-center justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <div
          className="size-3 shrink-0 rounded-xs"
          style={{ backgroundColor: getCalendarColor(calendar) }}
        />
        <span className="truncate text-sm text-foreground">{name || slug}</span>
      </div>

      {children}
    </div>
  )
}
