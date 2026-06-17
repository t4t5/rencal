import { getHours, startOfHour } from "date-fns"
import { useEffect, useRef } from "react"

import { MonthTimedEvent } from "@/components/events-blocks/month-view/TimedEventBlock"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

import type { TimedEventItem } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { useOpenDayDraft } from "@/hooks/useOpenDayDraft"
import { registerActiveDayDraft } from "@/lib/active-day-draft"
import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { toViewerZonedDateTime } from "@/lib/event-time"
import { isDeclinedEvent, isPendingEvent } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

const MAX_TIMED_VISIBLE = 4

type MonthDayCellProps = {
  day: MonthDay
  timedEvents: TimedEventItem[]
  hiddenAllDayCount: number
  reservedAllDayHeight: number
  activeEventKey: string | null
  selectedEventKey: string | null
  isActiveDay: boolean
  onClick: () => void
  onEventClick: (eventKey: string) => void
  draftEvent: CalendarEvent | null
  dimmed: boolean
}

export function MonthDayCell({
  day,
  timedEvents,
  hiddenAllDayCount,
  reservedAllDayHeight,
  activeEventKey,
  selectedEventKey,
  isActiveDay,
  onClick,
  onEventClick,
  draftEvent,
  dimmed,
}: MonthDayCellProps) {
  const { calendars } = useCalendars()
  const { defaultCalendarId } = useEventDraft()
  const { canCreate } = useCreateEventGate()
  const openDayDraft = useOpenDayDraft()
  const cellRef = useRef<HTMLDivElement | null>(null)
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
    openDayDraft(day.date, el, { startHour: getStartHour() })
  }

  useEffect(() => {
    if (!isActiveDay) return

    registerActiveDayDraft(() => {
      if (cellRef.current) handleCreateEvent(cellRef.current)
    })
    return () => registerActiveDayDraft(null)
  }, [isActiveDay, timedEvents, canCreate, defaultCalendarId])

  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex flex-col gap-1 px-1 pb-1 min-h-0 overflow-hidden cursor-default border-r border-divider last:border-r-0",
            day.isWeekend && "bg-weekend",
            isActiveDay && "bg-accent",
          )}
          ref={cellRef}
          onClick={onClick}
          onContextMenu={(e) => {
            contextTargetRef.current = e.currentTarget
          }}
        >
          {reservedAllDayHeight > 0 && (
            <div style={{ height: `${reservedAllDayHeight}px`, flexShrink: 0 }} />
          )}
          {visibleTimed.map((item) => {
            const key = eventKey(item.event)

            return (
              <MonthTimedEvent
                key={key}
                item={item}
                highlighted={key === activeEventKey || key === selectedEventKey}
                isPending={isPendingEvent(item.event, calendars)}
                isDeclined={isDeclinedEvent(item.event, calendars)}
                isDraft={item.event === draftEvent}
                dimmed={dimmed}
                onClick={() => onEventClick(key)}
              />
            )
          })}

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
