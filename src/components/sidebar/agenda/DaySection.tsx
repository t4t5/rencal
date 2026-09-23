import { Temporal } from "@js-temporal/polyfill"
import { forwardRef, type FocusEvent, type KeyboardEvent, type ReactNode, useMemo } from "react"

import { focusEventPopoverField } from "@/components/event-parts/useEventPopoverTabTrap"
import { AgendaAllDayEventBlock } from "@/components/events-blocks/agenda/AllDayEventBlock"
import { AgendaTimedEventBlock } from "@/components/events-blocks/agenda/TimedEventBlock"

import { useAgendaSelection } from "@/contexts/AgendaFocusContext"
import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation } from "@/contexts/CalendarStateContext"

import type { Calendar } from "@/lib/api"
import { eventKey, type CalendarEvent, type ResponseStatus } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { setEventAnchor } from "@/lib/event-anchor"
import { getCalendarEventStyle } from "@/lib/event-styles"
import {
  coversFullDay,
  epochDay,
  formatDateKey,
  formatDayMonth,
  getRelativeDayLabel,
  today,
} from "@/lib/event-time"
import { getUserResponseStatus, isEventReadonly } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

import {
  AGENDA_ITEM_SELECTOR,
  clearRememberedAgendaItem,
  rememberFocusedAgendaItem,
} from "./useAgendaKeyboardNav"

export const DaySection = forwardRef<
  HTMLDivElement,
  {
    date: Temporal.PlainDate
    events: CalendarEvent[]
    calendars: Calendar[]
    draftEvent: CalendarEvent | null
    onDeleteEvent: (event: CalendarEvent) => void
  }
>(({ date, events, calendars, draftEvent, onDeleteEvent }, ref) => {
  const { activeEvent, setActiveEventKey, toggleActiveEventKey } = useCalEvents()
  const { setActiveDate } = useCalendarNavigation()
  const { selectedEventKey, setSelectedEventKey } = useAgendaSelection()

  const calendarBySlug = useMemo(() => new Map(calendars.map((c) => [c.slug, c])), [calendars])
  const dateKey = formatDateKey(date)

  const getRowState = (event: CalendarEvent): RowState => {
    const key = eventKey(event)
    const isDraft = !!draftEvent && key === eventKey(draftEvent)

    return {
      key,
      calendarColor: getCalendarColor(calendarBySlug.get(event.calendar_slug)),
      isDraft,
      isActive: !isDraft && !!activeEvent && key === eventKey(activeEvent),
      isSelected: key === selectedEventKey,
      rsvp: getUserResponseStatus(event, calendars),
    }
  }

  const handleSelect = (event: CalendarEvent, target: HTMLElement) => {
    setEventAnchor(target)
    toggleActiveEventKey(eventKey(event))
  }

  const handleFocus = (event: CalendarEvent, target: HTMLElement) => {
    const key = eventKey(event)
    rememberFocusedAgendaItem(target)
    setSelectedEventKey(key)
    setActiveDate(date)
  }

  const handleBlur = (e: FocusEvent<HTMLElement>) => {
    if ((e.relatedTarget as HTMLElement | null)?.closest(AGENDA_ITEM_SELECTOR)) return
    clearRememberedAgendaItem()
    setSelectedEventKey(null)
  }

  const handleKeyDown = (event: CalendarEvent, e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      const isDraft = !!draftEvent && eventKey(draftEvent) === eventKey(event)
      if (activeEvent || isDraft || isEventReadonly(event, calendars)) return

      e.preventDefault()
      onDeleteEvent(event)
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      setEventAnchor(e.currentTarget)
      setActiveEventKey(eventKey(event))
      return
    }

    if (e.key === "Tab" && activeEvent) {
      e.preventDefault()
      focusEventPopoverField(e.shiftKey)
      return
    }

    if (e.key === "Escape") {
      e.preventDefault()
      if (activeEvent) {
        setActiveEventKey(null)
        return
      }
      e.currentTarget.blur()
    }
  }

  // A timed event that covers this entire day (e.g. the middle of a
  // multi-day span) is shown as an all-day chip, not a timed row.
  const day = epochDay(date)
  const allDayEvents: CalendarEvent[] = []
  const timedEvents: CalendarEvent[] = []
  for (const event of events) {
    if (coversFullDay(event.start, event.dateInfo, day)) allDayEvents.push(event)
    else timedEvents.push(event)
  }

  return (
    <div
      ref={ref}
      data-slot="agenda-day"
      data-date={dateKey}
      className="relative border-b border-border"
    >
      <DateBar date={date} />

      <div className="flex flex-col gap-1 pb-2">
        {!events.length && (
          <div data-slot="agenda-empty" className="py-1 text-sm text-muted-foreground">
            No events
          </div>
        )}

        {allDayEvents.length > 0 && (
          <div data-slot="agenda-all-day-events" className="py-1 flex flex-wrap gap-1">
            {allDayEvents.map((event) => (
              <AllDayRow
                key={eventKey(event)}
                event={event}
                dateKey={dateKey}
                state={getRowState(event)}
                onSelect={handleSelect}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
              />
            ))}
          </div>
        )}

        {timedEvents.map((event) => (
          <TimedRow
            key={eventKey(event)}
            event={event}
            dateKey={dateKey}
            state={getRowState(event)}
            onSelect={handleSelect}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
        ))}
      </div>
    </div>
  )
})

type RowState = {
  key: string
  calendarColor: string
  isActive: boolean
  isSelected: boolean
  isDraft: boolean
  rsvp: ResponseStatus | null
}

type RowHandlers = {
  onSelect: (event: CalendarEvent, target: HTMLElement) => void
  onFocus: (event: CalendarEvent, target: HTMLElement) => void
  onBlur: (e: FocusEvent<HTMLElement>) => void
  onKeyDown: (event: CalendarEvent, e: KeyboardEvent<HTMLElement>) => void
}

type RowProps = {
  event: CalendarEvent
  dateKey: string
  state: RowState
} & RowHandlers

type AgendaEventRowShellProps = {
  event: CalendarEvent
  dateKey: string
  state: RowState
  allDay?: boolean
  className?: string
  children: ReactNode
} & RowHandlers

const AgendaEventRowShell = ({
  event,
  dateKey,
  state,
  allDay,
  className,
  children,
  onSelect,
  onFocus,
  onBlur,
  onKeyDown,
}: AgendaEventRowShellProps) => (
  <div
    tabIndex={-1}
    data-slot="calendar-event"
    data-view="agenda"
    data-kind={allDay ? "all-day" : "timed"}
    data-event-clickable={!state.isDraft || undefined}
    data-selected={state.isActive || state.isSelected || undefined}
    data-rsvp={state.rsvp ?? undefined}
    data-draft={state.isDraft || undefined}
    data-agenda-item
    data-event-key={state.key}
    data-date-key={dateKey}
    data-all-day={allDay || undefined}
    onFocus={(e) => onFocus(event, e.currentTarget)}
    onBlur={onBlur}
    onKeyDown={(e) => onKeyDown(event, e)}
    onClick={state.isDraft ? undefined : (e) => onSelect(event, e.currentTarget)}
    className={className}
    style={getCalendarEventStyle({
      calendarColor: state.calendarColor,
      eventColor: event.color,
    })}
  >
    {children}
  </div>
)

const AllDayRow = ({ event, dateKey, state, ...handlers }: RowProps) => {
  return (
    <AgendaEventRowShell
      event={event}
      dateKey={dateKey}
      state={state}
      allDay
      className="rounded-base outline-none px-1 py-px leading-4 inline-flex text-xs cursor-default"
      {...handlers}
    >
      <AgendaAllDayEventBlock event={event} />
    </AgendaEventRowShell>
  )
}

const TimedRow = ({ event, dateKey, state, ...handlers }: RowProps) => {
  return (
    <AgendaEventRowShell
      event={event}
      dateKey={dateKey}
      state={state}
      className="flex gap-3 cursor-default py-1 outline-none"
      {...handlers}
    >
      <AgendaTimedEventBlock event={event} dateKey={dateKey} />
    </AgendaEventRowShell>
  )
}

const DateBar = ({ date }: { date: Temporal.PlainDate }) => {
  const isToday = date.equals(today())

  return (
    <div
      data-slot="agenda-day-header"
      data-today={isToday || undefined}
      className={cn("sticky top-0 z-10 text-sm bg-background py-1.5 flex gap-2 h-8 items-center", {
        "text-today": isToday,
      })}
    >
      <span data-slot="agenda-weekday" data-typography="numerical" className="font-bold uppercase">
        {getRelativeDayLabel(date)}
      </span>
      <span
        data-slot="agenda-day-number"
        data-typography="numerical"
        className={cn("text-muted-foreground", { "text-today": isToday })}
      >
        {formatDayMonth(date)}
      </span>
    </div>
  )
}
