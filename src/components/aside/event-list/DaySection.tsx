import { format, isSameYear, isToday } from "date-fns"
import { forwardRef, memo } from "react"

import type { Calendar, CalendarEvent } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { setEventAnchor } from "@/lib/event-anchor"
import { isDeclinedEvent, isPendingEvent } from "@/lib/event-utils"
import { formatDateKey } from "@/lib/time"
import { getRelativeDayLabel } from "@/lib/time"
import { cn } from "@/lib/utils"

import { EventRow } from "./EventRow"

type DaySectionProps = {
  date: Date
  events: CalendarEvent[]
  calendars: Calendar[]
  draftEvent: CalendarEvent | null
}

export const DaySection = memo(
  forwardRef<HTMLDivElement, DaySectionProps>(({ date, events, calendars, draftEvent }, ref) => {
    const { activeEvent, toggleActiveEventId } = useCalEvents()

    return (
      <div ref={ref} data-date={formatDateKey(date)} className="relative border-b border-b-divider">
        <div
          className={cn(
            "sticky top-0 z-10 text-sm bg-background px-3 py-1.5 flex gap-2 h-8 items-center",
            {
              "text-today": isToday(date),
            },
          )}
        >
          <span className="font-bold uppercase font-numerical">{getRelativeDayLabel(date)}</span>
          <span
            className={cn("text-muted-foreground font-numerical", {
              "text-today": isToday(date),
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
              const isDraft = event === draftEvent
              const isActive = !isDraft && event.id === activeEvent?.id
              const calendar = calendars.find((c) => c.slug === event.calendar_slug)
              const isPending = isPendingEvent(event, calendars)
              const isDeclined = isDeclinedEvent(event, calendars)

              return (
                <div
                  key={isDraft ? "__draft__" : event.id}
                  data-event-clickable={!isDraft || undefined}
                  onClick={
                    isDraft
                      ? undefined
                      : (e) => {
                          setEventAnchor(e.currentTarget)
                          toggleActiveEventId(event.id)
                        }
                  }
                  className={cn("cursor-default hover:bg-secondary py-1", {
                    "bg-accent!": isActive,
                    "opacity-50": isPending || isDeclined || isDraft,
                    "line-through": isDeclined,
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
  }),
)
