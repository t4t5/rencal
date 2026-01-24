import { format, isSameDay } from "date-fns"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { CalendarEvent } from "@/db/types"

// Read-only event display for the caldir PoC
// Edit functionality will be added in a future phase
export const EditEvent = ({ event }: { event: CalendarEvent | null }) => {
  const { calendars } = useCalendarState()

  if (!event) {
    return (
      <div className="px-4 pt-5 pb-2 flex flex-col grow items-center justify-center text-muted-foreground">
        Select an event to view details
      </div>
    )
  }

  const calendar = calendars.find((c) => c.slug === event.calendarSlug)
  const { summary, start, end, allDay, location, description } = event

  const formatTime = () => {
    if (allDay) {
      if (isSameDay(start, end)) {
        return format(start, "EEEE, MMMM d, yyyy")
      }
      return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`
    }
    if (isSameDay(start, end)) {
      return `${format(start, "EEEE, MMMM d, yyyy")} | ${format(start, "h:mm a")} - ${format(end, "h:mm a")}`
    }
    return `${format(start, "MMM d, h:mm a")} - ${format(end, "MMM d, h:mm a")}`
  }

  return (
    <div className="px-4 pt-5 pb-2 flex flex-col grow gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{summary || "(No title)"}</h2>
        <p className="text-sm text-muted-foreground">{formatTime()}</p>
      </div>

      {calendar && (
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: calendar.color || "#888" }}
          />
          <span className="text-sm">{calendar.name}</span>
        </div>
      )}

      {location && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase">Location</span>
          <span className="text-sm">{location}</span>
        </div>
      )}

      {description && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase">Description</span>
          <p className="text-sm whitespace-pre-wrap">{description}</p>
        </div>
      )}

      {event.isRecurring && (
        <div className="text-xs text-muted-foreground">This is a recurring event</div>
      )}

      <div className="mt-auto pt-4 text-xs text-muted-foreground text-center">
        Event editing will be available in a future update
      </div>
    </div>
  )
}
