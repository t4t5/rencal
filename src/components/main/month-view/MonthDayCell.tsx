import { addHours, getHours, setHours, startOfDay, startOfHour } from "date-fns"
import { useRef } from "react"

import { MonthTimedEvent } from "@/components/main/month-view/MonthTimedEvent"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

import type { TimedEventItem } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import type { CalendarEvent } from "@/lib/cal-events"
import { setDraftAnchor } from "@/lib/draft-anchor"
import { fromDate, getLocalTzid, toViewerZonedDateTime } from "@/lib/event-time"
import { isDeclinedEvent, isPendingEvent } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

const MAX_TIMED_VISIBLE = 4

type MonthDayCellProps = {
  day: MonthDay
  timedEvents: TimedEventItem[]
  hiddenAllDayCount: number
  reservedAllDayHeight: number
  activeEventId: string | null
  isActiveDay: boolean
  onClick: () => void
  onEventClick: (eventId: string) => void
  draftEvent: CalendarEvent | null
  dimmed: boolean
}

export function MonthDayCell({
  day,
  timedEvents,
  hiddenAllDayCount,
  reservedAllDayHeight,
  activeEventId,
  isActiveDay,
  onClick,
  onEventClick,
  draftEvent,
  dimmed,
}: MonthDayCellProps) {
  const { calendars } = useCalendars()
  const { setActiveEventId } = useCalEvents()
  const { setDraftEvent, setDraftPopoverOpen, setIsDrafting, defaultCalendarId } = useEventDraft()
  const { canCreate, promptToConnect } = useCreateEventGate()
  const contextTargetRef = useRef<HTMLElement | null>(null)

  const visibleTimed = timedEvents.slice(0, MAX_TIMED_VISIBLE)
  const hiddenTimedCount = timedEvents.length - visibleTimed.length
  const totalHidden = hiddenAllDayCount + hiddenTimedCount

  const getStartHour = () => {
    const lastEvent = timedEvents.at(-1)
    if (lastEvent) return toViewerZonedDateTime(lastEvent.event.end).hour
    return getHours(startOfHour(new Date()))
  }

  const handleCreateEvent = (el: HTMLElement) => {
    if (!canCreate) {
      promptToConnect()
      return
    }
    const startHour = getStartHour()
    const startJs = setHours(startOfDay(day.date), startHour)
    const endJs = addHours(startJs, 1)
    const tzid = getLocalTzid()
    const start = fromDate(startJs, tzid)
    const end = fromDate(endJs, tzid)

    setActiveEventId(null)
    setIsDrafting(false)
    setDraftEvent({
      summary: "",
      description: null,
      start,
      end,
      calendarId: defaultCalendarId,
      location: null,
      recurrence: null,
    })
    setDraftAnchor(el)
    setDraftPopoverOpen(true)
  }

  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex flex-col gap-1 px-0.5 pb-1 min-h-0 overflow-hidden cursor-default border-r border-divider last:border-r-0",
            day.isWeekend && "bg-weekend",
            isActiveDay && "bg-accent",
          )}
          onClick={onClick}
          onContextMenu={(e) => {
            contextTargetRef.current = e.currentTarget
          }}
        >
          {reservedAllDayHeight > 0 && (
            <div style={{ height: `${reservedAllDayHeight}px`, flexShrink: 0 }} />
          )}
          {visibleTimed.map((item) => (
            <MonthTimedEvent
              key={item.event.id}
              item={item}
              isActive={item.event.id === activeEventId}
              isPending={isPendingEvent(item.event, calendars)}
              isDeclined={isDeclinedEvent(item.event, calendars)}
              isDraft={item.event === draftEvent}
              dimmed={dimmed}
              onClick={() => onEventClick(item.event.id)}
            />
          ))}

          {totalHidden > 0 && (
            <div className="text-xs text-muted-foreground px-0.5 truncate shrink-0">
              +{totalHidden} more
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => {
            setTimeout(() => {
              handleCreateEvent(contextTargetRef.current!)
            })
          }}
        >
          Create event
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
