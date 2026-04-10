import { PiRssSimple as RssIcon } from "react-icons/pi"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

import { Calendar } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"

import { cn } from "@/lib/utils"

const providerDisplayName: Record<string, string> = {
  google: "Google",
  icloud: "iCloud",
  outlook: "Outlook",
}

export function CalendarsSection() {
  const { calendars } = useCalendars()

  const calendarsByProvider = Object.groupBy(calendars, (c) => c.provider ?? "Local")

  return (
    <div className="flex flex-col gap-6">
      {Object.entries(calendarsByProvider).map(([provider, cals]) => {
        const displayName = providerDisplayName[provider] ?? provider
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

      <Button variant="secondary" className="self-start gap-2" disabled>
        <RssIcon className="size-4" />
        Add subscription
      </Button>
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
            ? { backgroundColor: calendar.color ?? "#888", borderColor: calendar.color ?? "#888" }
            : undefined
        }
      />
      <span className={cn("text-sm", { "text-muted-foreground": !isVisible })}>
        {calendar.name ?? calendar.slug}
      </span>
    </label>
  )
}
