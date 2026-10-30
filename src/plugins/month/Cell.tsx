import { Temporal } from "@js-temporal/polyfill"
import { type PointerEvent as ReactPointerEvent, type RefObject, useRef, useState } from "react"

import {
  ACTIVE_DAY_ID,
  atTime,
  type CalendarEvent,
  cn,
  ContextMenu,
  dropZoneProps,
  type EventTime,
  Tooltip,
  UntitledEventText,
  useEventProps,
  useEventSelection,
  useOpenDraft,
} from "@/sdk"

import { MonthTimedEvent, MonthTimedEventContent } from "./TimedEventBlock"
import { type AllDayLaneItem, isSpanning } from "./useMonthEventLayout"
import type { MonthDay } from "./useMonthGrid"

const MAX_TIMED_VISIBLE = 4
// Past this, the "+n more" tooltip summarises the rest instead of growing off-screen.
const MAX_TOOLTIP_ROWS = 12
const DAY_MINUTES = 24 * 60

type MonthDayCellProps = {
  day: MonthDay
  timedEvents: CalendarEvent[]
  hiddenAllDayItems: AllDayLaneItem[]
  reservedAllDayHeight: string | null
  isActiveDay: boolean
  onClick: () => void
  startCreateDrag: (day: Temporal.PlainDate, event: ReactPointerEvent<HTMLElement>) => void
}

/**
 * Where a new event on `date` starts: when its last timed event ends, so it
 * follows the day's events, or 08:00 when that is midnight. Null for a free day.
 */
function afterLastEvent(date: Temporal.PlainDate, timedEvents: CalendarEvent[]): EventTime | null {
  const last = timedEvents.at(-1)
  if (!last) return null
  return last.endMinutes < DAY_MINUTES ? last.end : atTime(date, 8)
}

export function MonthDayCell({
  day,
  timedEvents,
  hiddenAllDayItems,
  reservedAllDayHeight,
  isActiveDay,
  onClick,
  startCreateDrag,
}: MonthDayCellProps) {
  const openDraft = useOpenDraft()
  const contextTargetRef = useRef<HTMLElement | null>(null)

  const visibleTimed = timedEvents.slice(0, MAX_TIMED_VISIBLE)
  const hiddenEvents = [
    ...hiddenAllDayItems.map((item) => item.event),
    ...timedEvents.slice(MAX_TIMED_VISIBLE),
  ]

  const handleCreateEvent = (el: HTMLElement) => {
    openDraft(day.date, el, { start: afterLastEvent(day.date, timedEvents) })
  }

  return (
    <ContextMenu
      items={[
        { label: "Create event", onSelect: () => handleCreateEvent(contextTargetRef.current!) },
      ]}
    >
      <div
        data-slot="month-day"
        data-selected={isActiveDay || undefined}
        data-weekend={day.isWeekend || undefined}
        className={cn(
          // The divider is an inset shadow so it takes no width; all-day bars assume none.
          "flex flex-col gap-1 px-(--month-padding-inline) pb-1 min-h-0 overflow-hidden cursor-default shadow-[inset_-1px_0_var(--border)] last:shadow-none",
          day.isWeekend && "bg-weekend",
          isActiveDay && "bg-selected text-selected-foreground",
        )}
        id={isActiveDay ? ACTIVE_DAY_ID : undefined}
        {...dropZoneProps(day.date, "day")}
        onClick={onClick}
        onPointerDown={(event) => startCreateDrag(day.date, event)}
        onContextMenu={(e) => {
          contextTargetRef.current = e.currentTarget
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-event-clickable]")) return
          handleCreateEvent(e.currentTarget)
        }}
      >
        {reservedAllDayHeight && (
          <div
            className="pointer-events-none"
            style={{ height: reservedAllDayHeight, flexShrink: 0 }}
          />
        )}
        {visibleTimed.map((event) => (
          <MonthTimedEvent key={event.key} event={event} />
        ))}

        {hiddenEvents.length > 0 && <HiddenEventsLabel events={hiddenEvents} />}
      </div>
    </ContextMenu>
  )
}

/** "+n more" label whose tooltip lists the events that didn't fit in the cell. */
function HiddenEventsLabel({ events }: { events: CalendarEvent[] }) {
  const [open, setOpen] = useState(false)
  const labelRef = useRef<HTMLDivElement>(null)
  const rows = events.length > MAX_TOOLTIP_ROWS ? events.slice(0, MAX_TOOLTIP_ROWS - 1) : events
  const rest = events.length - rows.length

  return (
    <Tooltip
      side="right"
      delay={300}
      open={open}
      onOpenChange={setOpen}
      className="max-w-64 flex-col items-stretch gap-1 p-1.5"
      content={
        <>
          {rows.map((event) => (
            <HiddenEventRow
              key={event.key}
              event={event}
              labelRef={labelRef}
              onOpen={() => setOpen(false)}
            />
          ))}
          {rest > 0 && <span className="text-2xs opacity-70 px-1.5">and {rest} more</span>}
        </>
      }
    >
      <div
        ref={labelRef}
        className="text-xs text-muted-foreground px-0.5 truncate shrink-0 self-start hover:text-foreground"
      >
        +{events.length} more
      </div>
    </Tooltip>
  )
}

/** A plain row, which unmounts when the tooltip closes: no drag or context menu. */
function HiddenEventRow({
  event,
  labelRef,
  onOpen,
}: {
  event: CalendarEvent
  labelRef: RefObject<HTMLDivElement | null>
  onOpen: () => void
}) {
  const eventProps = useEventProps(event)
  const { toggle } = useEventSelection()
  const spanning = isSpanning(event)

  return (
    <div
      {...eventProps}
      data-view="month"
      // Multi-day timed events sit in the all-day lanes too.
      data-kind={spanning ? "all-day" : "timed"}
      className={cn(
        "text-xs truncate cursor-default rounded-xs shrink-0",
        spanning
          ? "px-(--event-padding-inline) py-px"
          : "flex items-center gap-(--event-padding-inline) pr-(--event-padding-inline)",
      )}
      onClick={
        eventProps.onClick &&
        ((e) => {
          e.stopPropagation()
          onOpen()
          // Anchor to the label: the row unmounts once the tooltip closes.
          if (labelRef.current) toggle(event, labelRef.current)
        })
      }
    >
      {spanning ? (
        <span data-slot="calendar-event-title">{event.summary || <UntitledEventText />}</span>
      ) : (
        <MonthTimedEventContent event={event} />
      )}
    </div>
  )
}
