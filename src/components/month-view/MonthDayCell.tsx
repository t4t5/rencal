import { addHours, getHours, setHours, startOfDay, startOfHour } from "date-fns"
import { useRef } from "react"

import { MonthTimedEvent } from "@/components/month-view/MonthTimedEvent"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

import type { CalendarEvent } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

import type { TimedEventItem } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { setDraftAnchor } from "@/lib/draft-anchor"
import { isDeclinedEvent, isPendingEvent } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

const MAX_TIMED_VISIBLE = 2

type MonthDayCellProps = {
  day: MonthDay
  timedEvents: TimedEventItem[]
  hiddenAllDayCount: number
  activeEventId: string | null
  isActiveDay: boolean
  onClick: () => void
  onEventClick: (eventId: string) => void
  draftEvent: CalendarEvent | null
}

export function MonthDayCell({
  day,
  timedEvents,
  hiddenAllDayCount,
  activeEventId,
  isActiveDay,
  onClick,
  onEventClick,
  draftEvent,
}: MonthDayCellProps) {
  const { calendars } = useCalendars()
  const { setActiveEventId } = useCalEvents()
  const { setDraftEvent, setDraftPopoverOpen, setIsDrafting, defaultCalendarId } = useEventDraft()
  const contextTargetRef = useRef<HTMLElement | null>(null)

  const visibleTimed = timedEvents.slice(0, MAX_TIMED_VISIBLE)
  const hiddenTimedCount = timedEvents.length - visibleTimed.length
  const totalHidden = hiddenAllDayCount + hiddenTimedCount

  const getStartHour = () => {
    const lastEvent = timedEvents.at(-1)
    if (lastEvent) return getHours(new Date(lastEvent.event.end))
    return getHours(startOfHour(new Date()))
  }

  const handleCreateEvent = (el: HTMLElement) => {
    const startHour = getStartHour()
    const start = setHours(startOfDay(day.date), startHour)
    const end = addHours(start, 1)

    setActiveEventId(null)
    setIsDrafting(false)
    setDraftEvent({
      summary: "",
      description: null,
      allDay: false,
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
            "flex flex-col gap-px px-0.5 pb-1 min-h-0 overflow-hidden cursor-default border-r border-border last:border-r-0",
            day.isWeekend && "bg-weekendBg",
            isActiveDay && "bg-buttonSecondaryBgHover",
          )}
          onClick={onClick}
          onContextMenu={(e) => {
            contextTargetRef.current = e.currentTarget
          }}
        >
          {visibleTimed.map((item) => (
            <MonthTimedEvent
              key={item.event.id}
              item={item}
              isActive={item.event.id === activeEventId}
              isPending={isPendingEvent(item.event, calendars)}
              isDeclined={isDeclinedEvent(item.event, calendars)}
              isDraft={item.event === draftEvent}
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
