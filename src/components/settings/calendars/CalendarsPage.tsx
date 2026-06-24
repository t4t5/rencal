import { ReactNode } from "react"

import { CalendarItem } from "@/components/event-parts/inputs/CalendarSelect"
import { Button } from "@/components/ui/button"
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
import { cn } from "@/lib/utils"

import { MoreHorizIcon } from "@/icons/more-horiz"
import { PlusIcon } from "@/icons/plus"
import { RssIcon } from "@/icons/rss"

import { SettingsContent } from "../SettingsContent"

export function CalendarsPage() {
  return (
    <div className="flex grow">
      <GroupList />
      <CalendarsList />
    </div>
  )
}

// TODO: Make this dynamic:
const GROUPS = ["Default", "Work"]
const ACTIVE_GROUP = "Default"

function GroupList() {
  return (
    <SettingsContent className="w-[220px] border-r border-r-divider gap-2 py-6">
      <div className="flex justify-between items-center w-full">
        <span className="text-sm text-muted-foreground">Groups</span>

        <Button size="icon-sm" variant="ghost">
          <PlusIcon className="size-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {GROUPS.map((group) => (
          <div
            key={group}
            className={cn("text-sm rounded-md text-muted-foreground px-3 py-2", {
              "bg-secondary text-accent-foreground": ACTIVE_GROUP === group,
            })}
          >
            {group}
          </div>
        ))}
      </div>
    </SettingsContent>
  )
}

function CalendarsList() {
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
