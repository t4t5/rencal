import { ReactNode } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ItemContent, ItemMedia } from "@/components/ui/item"
import { SelectMenuTrigger } from "@/components/ui/select"

import { useCalendars } from "@/contexts/CalendarStateContext"

import type { Calendar } from "@/lib/api"
import { getCalendarColor } from "@/lib/calendar-styles"
import { cn } from "@/lib/utils"

import { CheckIcon } from "@/icons/check"

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
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={readOnly}>
        <SelectMenuTrigger
          controlLayout
          className={cn(
            "w-full",
            readOnly && "pointer-events-none disabled:cursor-default disabled:opacity-100",
          )}
        >
          <ItemMedia>
            {calendar && (
              <div
                className="size-3 shrink-0 rounded-xs"
                style={{ backgroundColor: getCalendarColor(calendar) }}
              />
            )}
          </ItemMedia>
          <ItemContent className="truncate text-left text-foreground">
            {calendar ? calendar.name || calendar.slug : "Select Calendar"}
          </ItemContent>
        </SelectMenuTrigger>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-(--radix-dropdown-menu-trigger-width)">
        {editableCalendars.map((cal) => (
          <DropdownMenuItem
            key={cal.slug}
            onSelect={() => onChange(cal.slug)}
            className="gap-(--control-content-gap)"
          >
            <ItemContent>
              <CalendarItem calendar={cal} />
            </ItemContent>
            <CheckIcon className={cn(calendar?.slug !== cal.slug && "invisible")} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
        <span className="truncate text-sm">{name || slug}</span>
      </div>

      {children}
    </div>
  )
}
