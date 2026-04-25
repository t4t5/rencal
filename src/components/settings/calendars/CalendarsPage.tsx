import { ReactNode } from "react"

import { CalendarItem } from "@/components/event-parts/inputs/CalendarSelect"
import { Button } from "@/components/ui/button"
/* import { Checkbox } from "@/components/ui/checkbox"
import { getCalendarColor } from "@/lib/calendar-styles"
import { cn } from "@/lib/utils" */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { Calendar } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { getProviderDisplayName } from "@/lib/providers"

import { MoreHorizIcon } from "@/icons/more-horiz"
import { RssIcon } from "@/icons/rss"

export function CalendarsPage() {
  const { calendars } = useCalendars()

  const remoteCalendars = calendars.filter((c) => c.provider !== null)
  const localCalendars = calendars.filter((c) => c.provider === null)
  const calendarsByProvider = Object.groupBy(remoteCalendars, (c) => c.provider as string)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        {Object.entries(calendarsByProvider).map(([provider, cals]) => (
          <CalendarGroup
            key={provider}
            title={getProviderDisplayName(provider)}
            calendars={cals ?? []}
          />
        ))}
        {localCalendars.length > 0 && (
          <CalendarGroup title="Local-only" calendars={localCalendars} />
        )}
      </div>

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
    </div>
  )
}

function CalendarGroup({ title, calendars }: { title: string; calendars: Calendar[] }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">{title}</span>
      <div className="flex flex-col gap-1">
        {calendars.map((calendar) => (
          <CalendarDropdownMenuWrapper key={calendar.slug} calendar={calendar}>
            <CalendarItem calendar={calendar} />
          </CalendarDropdownMenuWrapper>
        ))}
      </div>
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

      {isDefault && <span className="text-xs text-muted-foreground">Default</span>}

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

/*
function CalendarCheckboxItem({ calendar }: { calendar: Calendar }) {
  const isVisible = true // TODO: Implement visibility toggle

  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <Checkbox
        checked={isVisible}
        onCheckedChange={() => {
          // TODO: Implement visibility toggle using local DB keyed by calendar slug
        }}
        className="data-[state=checked]:border-transparent"
        style={
          isVisible
            ? {
                backgroundColor: getCalendarColor(calendar),
                borderColor: getCalendarColor(calendar),
              }
            : undefined
        }
      />
      <span className={cn("text-sm grow", { "text-muted-foreground": !isVisible })}>
        {calendar.name ?? calendar.slug}
      </span>
    </label>
  )
}
*/
