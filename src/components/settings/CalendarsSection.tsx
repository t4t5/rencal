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

// TODO: Implement calendar sets
const CALENDAR_SETS = ["My Calendar Set", "Work"]

export function CalendarsSection() {
  const { calendars } = useCalendars()

  const calendarsByProvider = Object.groupBy(calendars, (c) => c.provider ?? "Local")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        {CALENDAR_SETS.map((set, i) => (
          <button
            key={set}
            className={cn(
              "px-4 py-2 text-sm rounded-lg border border-border transition-colors",
              i === 0 ? "bg-accent text-accent-foreground" : "text-muted-foreground",
            )}
          >
            {set}
          </button>
        ))}
      </div>

      {Object.entries(calendarsByProvider).map(([provider, cals]) => {
        const displayName = providerDisplayName[provider] ?? provider
        return (
          <div key={provider} className="flex flex-col gap-3">
            <span className="text-sm text-muted-foreground">{displayName}</span>
            <div className="flex flex-col gap-3">
              {cals?.map((calendar) => (
                <CalendarCheckboxItem key={calendar.slug} calendar={calendar} />
              ))}
            </div>
          </div>
        )
      })}

      <Button variant="outline" className="self-start gap-2">
        <RssIcon className="size-4" />
        Add subscription
      </Button>
    </div>
  )
}

function CalendarCheckboxItem({ calendar }: { calendar: Calendar }) {
  const isVisible = true // TODO: Implement visibility toggle using local DB

  return (
    <label className="flex items-center gap-3 cursor-pointer">
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
