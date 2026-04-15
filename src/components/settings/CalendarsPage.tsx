import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { Calendar } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"

import { getCalendarColor } from "@/lib/calendar-styles"
import { getProviderDisplayName } from "@/lib/providers"
import { cn } from "@/lib/utils"

import { RssIcon } from "@/icons/rss"

export function CalendarsPage() {
  const { calendars } = useCalendars()

  const calendarsByProvider = Object.groupBy(calendars, (c) => c.provider ?? "Local")

  return (
    <div className="flex flex-col gap-6">
      {Object.entries(calendarsByProvider).map(([provider, cals]) => {
        const displayName = getProviderDisplayName(provider)
        return (
          <div key={provider} className="flex flex-col gap-3">
            <span className="text-sm text-muted-foreground">{displayName}</span>
            <div className="flex flex-col gap-2">
              {cals?.map((calendar) => (
                <CalendarCheckboxItem key={calendar.slug} calendar={calendar} />
              ))}
            </div>
          </div>
        )
      })}

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
  const isVisible = true // TODO: Implement visibility toggle using local DB

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
      <span className={cn("text-sm", { "text-muted-foreground": !isVisible })}>
        {calendar.name ?? calendar.slug}
      </span>
    </label>
  )
}
