import { format, isSameYear, isToday } from "date-fns"
import { forwardRef } from "react"

import type { Calendar, CalendarEvent } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { setEventAnchor } from "@/lib/event-anchor"
import { isPendingEvent } from "@/lib/event-utils"
import { getRelativeDayLabel } from "@/lib/time"
import { cn } from "@/lib/utils"

import { EventRow } from "./EventRow"

type DaySectionProps = {
  date: Date
  events: CalendarEvent[]
  calendars: Calendar[]
}

export const DaySection = forwardRef<HTMLDivElement, DaySectionProps>(
  ({ date, events, calendars }, ref) => {
    const { activeEvent, toggleActiveEventId } = useCalEvents()

    return (
      <div
        ref={ref}
        data-date={format(date, "yyyy-MM-dd")}
        className="relative border-b border-b-divider"
      >
        <div
          className={cn("sticky top-0 z-10 text-sm bg-bgPrimary px-3 py-1.5 flex gap-2", {
            "text-active": isToday(date),
          })}
        >
          <span className="font-bold uppercase">{getRelativeDayLabel(date)}</span>
          <span
            className={cn("text-muted-foreground", {
              "text-active": isToday(date),
            })}
          >
            {format(date, isSameYear(date, new Date()) ? "d MMM" : "d MMM yyyy")}
          </span>
        </div>

        <div className="flex flex-col gap-1 pb-2">
          {events.length === 0 ? (
            <div className="px-3 py-1 text-sm text-muted-foreground">No events</div>
          ) : (
            events.map((event) => {
              const isActive = event.id === activeEvent?.id
              const calendar = calendars.find((c) => c.slug === event.calendar_slug)
              const isPending = isPendingEvent(event, calendars)

              return (
                <div
                  key={event.id}
                  data-event-clickable
                  onClick={(e) => {
                    setEventAnchor(e.currentTarget)
                    toggleActiveEventId(event.id)
                  }}
                  className={cn("cursor-default hover:bg-secondary py-1", {
                    "bg-accent!": isActive,
                    "opacity-50": isPending,
                  })}
                >
                  <EventRow event={event} calendarColor={calendar?.color ?? null} />
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  },
)
