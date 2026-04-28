import { format, isSameYear, isToday } from "date-fns"
import { forwardRef, memo } from "react"

import { AgendaAllDayEventBlock } from "@/components/events-blocks/agenda/AllDayEventBlock"
import { AgendaTimedEventBlock } from "@/components/events-blocks/agenda/TimedEventBlock"

import type { Calendar } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"

import type { CalendarEvent } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { setEventAnchor } from "@/lib/event-anchor"
import { formatDateKey, getRelativeDayLabel, isAllDay } from "@/lib/event-time"
import { isDeclinedEvent, isPendingEvent } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

type DaySectionProps = {
  date: Date
  events: CalendarEvent[]
  calendars: Calendar[]
  draftEvent: CalendarEvent | null
}

const getEventState = ({
  event,
  calendars,
  draftEvent,
  activeEvent,
}: {
  event: CalendarEvent
  calendars: Calendar[]
  draftEvent: CalendarEvent | null
  activeEvent: CalendarEvent | null
}) => {
  const isDraft = event === draftEvent
  const isActive = !isDraft && event.id === activeEvent?.id
  const calendar = calendars.find((c) => c.slug === event.calendar_slug)
  const isPending = isPendingEvent(event, calendars)
  const isDeclined = isDeclinedEvent(event, calendars)

  return { isDraft, isActive, calendar, isPending, isDeclined }
}

export const DaySection = memo(
  forwardRef<HTMLDivElement, DaySectionProps>(({ date, events, calendars, draftEvent }, ref) => {
    const { activeEvent, toggleActiveEventId } = useCalEvents()

    const allDayEvents = events.filter((e) => isAllDay(e.start))
    const timedEvents = events.filter((e) => !isAllDay(e.start))

    const renderAllDayEventBlock = (event: CalendarEvent) => {
      const { isDraft, isActive, calendar, isPending, isDeclined } = getEventState({
        event,
        activeEvent,
        calendars,
        draftEvent,
      })

      return (
        <AgendaAllDayEventBlock
          key={event.id}
          event={event}
          calendarColor={getCalendarColor(calendar)}
          highlighted={isActive}
          isDashed={isPending || isDeclined}
          isDeclined={isDeclined}
          isDraft={isDraft}
          onClick={
            isDraft
              ? undefined
              : (e) => {
                  setEventAnchor(e.currentTarget)
                  toggleActiveEventId(event.id)
                }
          }
        />
      )
    }

    const renderTimedEventBlock = (event: CalendarEvent) => {
      const { isDraft, isActive, calendar, isPending, isDeclined } = getEventState({
        event,
        activeEvent,
        calendars,
        draftEvent,
      })

      return (
        <div
          key={event.id}
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
          <AgendaTimedEventBlock event={event} calendarColor={getCalendarColor(calendar)} />
        </div>
      )
    }

    return (
      <div ref={ref} data-date={formatDateKey(date)} className="relative border-b border-b-divider">
        <DateBar date={date} />

        <div className="flex flex-col gap-1 pb-2">
          {!events.length && (
            <div className="px-3 py-1 text-sm text-muted-foreground">No events</div>
          )}

          {allDayEvents.length > 0 && (
            <div className="px-3 py-1 flex flex-wrap gap-1">
              {allDayEvents.map(renderAllDayEventBlock)}
            </div>
          )}

          {timedEvents.map(renderTimedEventBlock)}
        </div>
      </div>
    )
  }),
)

const DateBar = ({ date }: { date: Date }) => {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 text-sm bg-background px-3 py-1.5 flex gap-2 h-8 items-center",
        {
          "text-today": isToday(date),
        },
      )}
    >
      <span className="font-bold uppercase numerical">{getRelativeDayLabel(date)}</span>
      <span
        className={cn("text-muted-foreground numerical", {
          "text-today": isToday(date),
        })}
      >
        {format(date, isSameYear(date, new Date()) ? "d MMM" : "d MMM yyyy")}
      </span>
    </div>
  )
}
