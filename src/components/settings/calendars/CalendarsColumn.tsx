import { CSSProperties, ReactNode } from "react"

import { SettingsContent } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { Calendar } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { getCalendarColor } from "@/lib/calendar-styles"
import { getProviderDisplayName } from "@/lib/providers"

import { MoreHorizIcon } from "@/icons/more-horiz"
import { RssIcon } from "@/icons/rss"

export function CalendarsColumn() {
  const { calendars } = useCalendars()

  const remoteCalendars = calendars.filter((c) => c.provider !== null)
  const localCalendars = calendars.filter((c) => c.provider === null)
  const calendarsByProvider = Object.groupBy(remoteCalendars, (c) => c.provider as string)

  return (
    <SettingsContent className="grow py-7">
      {!!calendars.length && (
        <div className="flex flex-col gap-4">
          {Object.entries(calendarsByProvider).map(([provider, cals]) => (
            <CalendarAccount
              key={provider}
              title={getProviderDisplayName(provider)}
              calendars={cals ?? []}
            />
          ))}

          {localCalendars.length > 0 && (
            <CalendarAccount title="Local-only" calendars={localCalendars} />
          )}
        </div>
      )}

      {!calendars.length && <div className="text-sm text-muted-foreground">No calendars yet.</div>}

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="self-start hidden">
            <Button variant="secondary" className="gap-2" disabled>
              <RssIcon className="size-4" />
              Add subscription
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Coming soon</TooltipContent>
      </Tooltip>
    </SettingsContent>
  )
}

function CalendarAccount({ title, calendars }: { title: string; calendars: Calendar[] }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">{title}</span>
      <div className="flex flex-col gap-1">
        {calendars.map((calendar) => (
          <CalendarDropdownMenuWrapper key={calendar.slug} calendar={calendar}>
            <TogglableCalendarItem calendar={calendar} />
          </CalendarDropdownMenuWrapper>
        ))}
      </div>
    </div>
  )
}

export function TogglableCalendarItem({
  calendar,
  children,
}: {
  calendar: Calendar
  children?: ReactNode
}) {
  const { name, slug } = calendar
  const id = `calendar-${slug}`

  const checked = true // TODO: Replace with actual state
  const calendarColor = getCalendarColor(calendar)
  const calendarColorStyle = { "--calendar-color": calendarColor } as CSSProperties

  return (
    <div className="flex items-center justify-between group max-w-full min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={() => {}}
          style={calendarColorStyle}
          className="cursor-pointer data-[state=checked]:border-[var(--calendar-color)] data-[state=checked]:bg-[var(--calendar-color)]"
        />

        <Label htmlFor={id} className="cursor-pointer text-sm text-foreground truncate">
          {name || slug}
        </Label>
      </div>

      {children}
    </div>
  )
}

function CalendarDropdownMenuWrapper({
  calendar,
  children,
}: {
  calendar: Calendar
  children: ReactNode
}) {
  const { defaultCalendar, setDefaultCalendar } = useSettings()
  const isDefault = defaultCalendar === calendar.slug

  return (
    <div className="flex items-center gap-3">
      <div className="grow">{children}</div>

      {isDefault && <span className="text-sm text-muted-foreground">Default</span>}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={isDefault}
            onClick={() => void setDefaultCalendar(calendar.slug)}
          >
            Set as default
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
