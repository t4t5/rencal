import { format, isSameYear, isToday } from "date-fns"
import { forwardRef, useMemo } from "react"

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

export const DaySection = forwardRef<
  HTMLDivElement,
  {
    date: Date
    events: CalendarEvent[]
    calendars: Calendar[]
    draftEvent: CalendarEvent | null
  }
>(({ date, events, calendars, draftEvent }, ref) => {
  const { activeEvent, toggleActiveEventId } = useCalEvents()

  const calendarBySlug = useMemo(() => new Map(calendars.map((c) => [c.slug, c])), [calendars])

  const getRowState = (event: CalendarEvent): RowState => {
    const isDraft = event.id === draftEvent?.id

    return {
      calendarColor: getCalendarColor(calendarBySlug.get(event.calendar_slug)),
      isDraft,
      isActive: !isDraft && event.id === activeEvent?.id,
      isPending: isPendingEvent(event, calendars),
      isDeclined: isDeclinedEvent(event, calendars),
    }
  }

  const handleSelect = (event: CalendarEvent, target: HTMLElement) => {
    setEventAnchor(target)
    toggleActiveEventId(event.id)
  }

  const allDayEvents = events.filter((e) => isAllDay(e.start))
  const timedEvents = events.filter((e) => !isAllDay(e.start))

  return (
    <div ref={ref} data-date={formatDateKey(date)} className="relative border-b border-b-divider">
      <DateBar date={date} />

      <div className="flex flex-col gap-1 pb-2">
        {!events.length && <div className="px-3 py-1 text-sm text-muted-foreground">No events</div>}

        {allDayEvents.length > 0 && (
          <div className="px-3 py-1 flex flex-wrap gap-1">
            {allDayEvents.map((event) => (
              <AllDayRow
                key={event.id}
                event={event}
                state={getRowState(event)}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}

        {timedEvents.map((event) => (
          <TimedRow
            key={event.id}
            event={event}
            state={getRowState(event)}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  )
})

type RowState = {
  calendarColor: string
  isActive: boolean
  isDraft: boolean
  isPending: boolean
  isDeclined: boolean
}

const AllDayRow = ({
  event,
  state,
  onSelect,
}: {
  event: CalendarEvent
  state: RowState
  onSelect: (event: CalendarEvent, target: HTMLElement) => void
}) => {
  const { calendarColor, isActive, isDraft, isPending, isDeclined } = state
  return (
    <AgendaAllDayEventBlock
      event={event}
      calendarColor={calendarColor}
      highlighted={isActive}
      isDashed={isPending || isDeclined}
      isDeclined={isDeclined}
      isDraft={isDraft}
      onClick={isDraft ? undefined : (e) => onSelect(event, e.currentTarget)}
    />
  )
}

const TimedRow = ({
  event,
  state,
  onSelect,
}: {
  event: CalendarEvent
  state: RowState
  onSelect: (event: CalendarEvent, target: HTMLElement) => void
}) => {
  const { calendarColor, isActive, isDraft, isPending, isDeclined } = state

  return (
    <div
      data-event-clickable={!isDraft || undefined}
      onClick={isDraft ? undefined : (e) => onSelect(event, e.currentTarget)}
      className={cn("cursor-default hover:bg-secondary py-1", {
        "bg-accent!": isActive,
        "opacity-50": isPending || isDeclined || isDraft,
        "line-through": isDeclined,
      })}
    >
      <AgendaTimedEventBlock event={event} calendarColor={calendarColor} />
    </div>
  )
}

const DateBar = ({ date }: { date: Date }) => {
  const today = isToday(date)

  return (
    <div
      className={cn(
        "sticky top-0 z-10 text-sm bg-background px-3 py-1.5 flex gap-2 h-8 items-center",
        { "text-today": today },
      )}
    >
      <span className="font-bold uppercase numerical">{getRelativeDayLabel(date)}</span>
      <span className={cn("text-muted-foreground numerical", { "text-today": today })}>
        {format(date, isSameYear(date, new Date()) ? "d MMM" : "d MMM yyyy")}
      </span>
    </div>
  )
}
