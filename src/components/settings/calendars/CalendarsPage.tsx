import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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

import { getCalendarColor } from "@/lib/calendar-styles"
import { getProviderDisplayName } from "@/lib/providers"
import { cn } from "@/lib/utils"

import { MoreHorizIcon } from "@/icons/more-horiz"
import { RssIcon } from "@/icons/rss"

export function CalendarsPage() {
  const { calendars } = useCalendars()

  const calendarsByProvider = Object.groupBy(calendars, (c) => c.provider ?? "Local")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        {Object.entries(calendarsByProvider).map(([provider, cals]) => {
          const displayName = getProviderDisplayName(provider)
          return (
            <div key={provider} className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">{displayName}</span>
              <div className="flex flex-col gap-1">
                {cals?.map((calendar) => (
                  <CalendarCheckboxItem key={calendar.slug} calendar={calendar} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="self-start">
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

function CalendarCheckboxItem({ calendar }: { calendar: Calendar }) {
  const { defaultCalendar, setDefaultCalendar } = useSettings()
  const isVisible = true // TODO: Implement visibility toggle using local DB
  const isDefault = defaultCalendar === calendar.slug

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
      {isDefault && <span className="text-xs text-muted-foreground">Default</span>}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            disabled={isDefault}
            onClick={() => void setDefaultCalendar(calendar.slug)}
          >
            Set as default
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </label>
  )
}
