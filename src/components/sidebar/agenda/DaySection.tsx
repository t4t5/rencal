import { format, isSameYear, isToday } from "date-fns"
import { forwardRef, type FocusEvent, type KeyboardEvent, type ReactNode, useMemo } from "react"

import { focusEventPopoverField } from "@/components/event-parts/useEventPopoverTabTrap"
import { AgendaAllDayEventBlock } from "@/components/events-blocks/agenda/AllDayEventBlock"
import { AgendaTimedEventBlock } from "@/components/events-blocks/agenda/TimedEventBlock"

import type { Calendar } from "@/rpc/bindings"

import { useAgendaSelection } from "@/contexts/AgendaFocusContext"
import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation } from "@/contexts/CalendarStateContext"

import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { setEventAnchor } from "@/lib/event-anchor"
import { formatDateKey, getRelativeDayLabel, isAllDay } from "@/lib/event-time"
import { isDeclinedEvent, isPendingEvent } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

import {
  AGENDA_ITEM_SELECTOR,
  clearRememberedAgendaItem,
  rememberFocusedAgendaItem,
} from "./useAgendaKeyboardNav"

export const DaySection = forwardRef<
  HTMLDivElement,
  {
    date: Date
    events: CalendarEvent[]
    calendars: Calendar[]
    draftEvent: CalendarEvent | null
  }
>(({ date, events, calendars, draftEvent }, ref) => {
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
      isPending: isPendingEvent(event, calendars),
      isDeclined: isDeclinedEvent(event, calendars),
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

  const allDayEvents = events.filter((e) => isAllDay(e.start))
  const timedEvents = events.filter((e) => !isAllDay(e.start))

  return (
    <div ref={ref} data-date={dateKey} className="relative border-b border-b-divider">
      <DateBar date={date} />

      <div className="flex flex-col gap-1 pb-2">
        {!events.length && <div className="px-3 py-1 text-sm text-muted-foreground">No events</div>}

        {allDayEvents.length > 0 && (
          <div className="px-3 py-1 flex flex-wrap gap-1">
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
  isPending: boolean
  isDeclined: boolean
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
    data-event-clickable={!state.isDraft || undefined}
    data-agenda-item
    data-event-key={state.key}
    data-date-key={dateKey}
    data-all-day={allDay || undefined}
    onFocus={(e) => onFocus(event, e.currentTarget)}
    onBlur={onBlur}
    onKeyDown={(e) => onKeyDown(event, e)}
    onClick={state.isDraft ? undefined : (e) => onSelect(event, e.currentTarget)}
    className={className}
  >
    {children}
  </div>
)

const AllDayRow = ({ event, dateKey, state, ...handlers }: RowProps) => {
  const { calendarColor, isActive, isSelected, isDraft, isPending, isDeclined } = state
  return (
    <AgendaEventRowShell
      event={event}
      dateKey={dateKey}
      state={state}
      allDay
      className="rounded outline-none"
      {...handlers}
    >
      <AgendaAllDayEventBlock
        event={event}
        calendarColor={calendarColor}
        highlighted={isActive || isSelected}
        isDashed={isPending || isDeclined}
        isDeclined={isDeclined}
        isDraft={isDraft}
      />
    </AgendaEventRowShell>
  )
}

const TimedRow = ({ event, dateKey, state, ...handlers }: RowProps) => {
  const { calendarColor, isActive, isSelected, isDraft, isPending, isDeclined } = state

  return (
    <AgendaEventRowShell
      event={event}
      dateKey={dateKey}
      state={state}
      className={cn("cursor-default hover:bg-secondary py-1 outline-none", {
        "bg-accent!": isActive || isSelected,
        "opacity-50": isPending || isDeclined || isDraft,
        "line-through": isDeclined,
      })}
      {...handlers}
    >
      <AgendaTimedEventBlock event={event} calendarColor={calendarColor} />
    </AgendaEventRowShell>
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
