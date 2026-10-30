import { type RefObject, useRef, useState } from "react"

import {
  type CalendarEvent,
  cn,
  dayProps,
  Tooltip,
  UntitledEventText,
  useEventProps,
  useEventSelection,
} from "@/sdk"

import { MonthTimedEvent, MonthTimedEventContent } from "./TimedEventBlock"
import { type AllDayLaneItem, isSpanning } from "./useMonthEventLayout"
import type { MonthDay } from "./useMonthGrid"

const MAX_TIMED_VISIBLE = 4
// Past this, the "+n more" tooltip summarises the rest instead of growing off-screen.
const MAX_TOOLTIP_ROWS = 12

type MonthDayCellProps = {
  day: MonthDay
  timedEvents: CalendarEvent[]
  hiddenAllDayItems: AllDayLaneItem[]
  reservedAllDayHeight: string | null
  isActiveDay: boolean
  onClick: () => void
}

export function MonthDayCell({
  day,
  timedEvents,
  hiddenAllDayItems,
  reservedAllDayHeight,
  isActiveDay,
  onClick,
}: MonthDayCellProps) {
  const visibleTimed = timedEvents.slice(0, MAX_TIMED_VISIBLE)
  const hiddenEvents = [
    ...hiddenAllDayItems.map((item) => item.event),
    ...timedEvents.slice(MAX_TIMED_VISIBLE),
  ]

  return (
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
      {...dayProps(day.date, "day")}
      onClick={onClick}
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
