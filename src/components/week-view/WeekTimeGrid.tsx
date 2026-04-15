import { addHours, endOfDay, format, setHours, startOfDay } from "date-fns"
import { useRef } from "react"

import type { Calendar, CalendarEvent } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

import type { AllDayLaneItem } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import type { WeekTimedEventLayout } from "@/hooks/cal-events/useWeekEventLayout"
import { setDraftAnchor } from "@/lib/draft-anchor"
import { isDeclinedEvent, isPendingEvent } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

import { AllDayContextMenu } from "./AllDayContextMenu"
import { CurrentTimeIndicator } from "./CurrentTimeIndicator"
import { ScheduledDayContextMenu } from "./ScheduledDayContextMenu"
import { WeekAllDayBar } from "./WeekAllDayBar"
import { WeekTimedEvent } from "./WeekTimedEvent"

type WeekTimeGridProps = {
  weekDays: MonthDay[]
  timedByCol: WeekTimedEventLayout[][]
  allDayItems: AllDayLaneItem[]
  maxAllDayLane: number
  activeEventId: string | null
  activeDateKey: string
  onDayClick: (date: Date) => void
  onEventClick: (id: string) => void
  visibleStartHour: number
  visibleEndHour: number
  draftEvent: CalendarEvent | null
}

export function WeekTimeGrid({
  weekDays,
  timedByCol,
  allDayItems,
  maxAllDayLane,
  activeEventId,
  activeDateKey,
  onDayClick,
  onEventClick,
  visibleStartHour,
  visibleEndHour,
  draftEvent,
}: WeekTimeGridProps) {
  const { calendars } = useCalendars()
  const { setActiveEventId } = useCalEvents()
  const { setDraftEvent, setDraftPopoverOpen, setIsDrafting, defaultCalendarId } = useEventDraft()

  const rangeHours = visibleEndHour - visibleStartHour

  const todayColIndex = weekDays.findIndex((d) => d.isToday)
  const hasAllDay = allDayItems.length > 0
  const contextTargetRef = useRef<HTMLElement | null>(null)

  const openCreatePopover = (
    day: Date,
    el: HTMLElement,
    opts: { allDay: boolean; startHour?: number },
  ) => {
    const start = opts.allDay ? startOfDay(day) : setHours(startOfDay(day), opts.startHour ?? 0)
    const end = opts.allDay ? endOfDay(day) : addHours(start, 1)

    setActiveEventId(null)
    setIsDrafting(false)
    setDraftEvent({
      summary: "",
      description: null,
      allDay: opts.allDay,
      start,
      end,
      calendarId: defaultCalendarId,
      location: null,
      recurrence: null,
    })
    setDraftAnchor(el)
    setDraftPopoverOpen(true)
  }

  const getHourFromClickY = (el: HTMLElement, clientY: number) => {
    const rect = el.getBoundingClientRect()
    const fraction = (clientY - rect.top) / rect.height
    const hour = visibleStartHour + fraction * rangeHours
    return Math.max(visibleStartHour, Math.min(visibleEndHour - 1, Math.floor(hour)))
  }

  return (
    <div
      className="grid grid-cols-7 h-full"
      style={{ gridTemplateRows: hasAllDay ? "auto auto 1fr" : "auto 1fr" }}
    >
      {/* Row 1: Day headers */}
      <DayHeaders weekDays={weekDays} activeDateKey={activeDateKey} onDayClick={onDayClick} />

      {/* Row 2: All-day events (only if present) */}
      {hasAllDay && (
        <AllDayEvents
          maxAllDayLane={maxAllDayLane}
          weekDays={weekDays}
          activeDateKey={activeDateKey}
          contextTargetRef={contextTargetRef}
          allDayItems={allDayItems}
          activeEventId={activeEventId}
          calendars={calendars}
          draftEvent={draftEvent}
          onCreateEvent={(day: MonthDay) => {
            openCreatePopover(day.date, contextTargetRef.current!, { allDay: true })
          }}
          onEventClick={onEventClick}
        />
      )}

      {/* Row 3: Time columns */}
      {weekDays.map((day, colIndex) => (
        <ScheduledDayContextMenu
          key={day.dateKey}
          onCreateEvent={(el, clickY) => {
            const startHour = getHourFromClickY(el, clickY)
            openCreatePopover(day.date, el, { allDay: false, startHour })
          }}
        >
          <div
            className={cn(
              "relative border-r border-border cursor-default",
              day.dateKey === activeDateKey
                ? "bg-buttonSecondaryBgHover"
                : day.isWeekend && "bg-weekendBg",
            )}
            onClick={() => onDayClick(day.date)}
          >
            {/* Timed events */}
            {timedByCol[colIndex].map((layout) => (
              <WeekTimedEvent
                key={layout.event.id}
                layout={layout}
                isActive={activeEventId === layout.event.id}
                isPending={isPendingEvent(layout.event, calendars)}
                isDeclined={isDeclinedEvent(layout.event, calendars)}
                isDraft={layout.event === draftEvent}
                onClick={() => onEventClick(layout.event.id)}
              />
            ))}

            {/* Current time indicator */}
            {colIndex === todayColIndex && (
              <CurrentTimeIndicator visibleStartHour={visibleStartHour} rangeHours={rangeHours} />
            )}
          </div>
        </ScheduledDayContextMenu>
      ))}
    </div>
  )
}

const DayHeaders = ({
  weekDays,
  activeDateKey,
  onDayClick,
}: {
  weekDays: MonthDay[]
  activeDateKey: string
  onDayClick: (date: Date) => void
}) => {
  return weekDays.map((day) => (
    <div
      key={day.dateKey}
      className={cn(
        "flex items-baseline justify-end gap-1 border-r border-border px-1 pt-1.5 cursor-default font-numerical",
        day.dateKey === activeDateKey
          ? "bg-buttonSecondaryBgHover"
          : day.isWeekend && "bg-weekendBg",
      )}
      onClick={() => onDayClick(day.date)}
    >
      <span className="text-[11px] text-muted-foreground uppercase">{format(day.date, "EEE")}</span>
      <span
        className={cn(
          "text-[13px] font-medium w-7 h-7 flex items-center justify-center rounded-circle",
          day.isToday && "bg-primary text-primary-foreground",
        )}
      >
        {format(day.date, "d")}
      </span>
    </div>
  ))
}

const AllDayEvents = ({
  weekDays,
  maxAllDayLane,
  activeDateKey,
  contextTargetRef,
  allDayItems,
  activeEventId,
  calendars,
  draftEvent,
  onCreateEvent,
  onEventClick,
}: {
  weekDays: MonthDay[]
  maxAllDayLane: number
  activeDateKey: string
  contextTargetRef: React.RefObject<HTMLElement | null>
  allDayItems: AllDayLaneItem[]
  activeEventId: string | null
  calendars: Calendar[]
  draftEvent: CalendarEvent | null
  onCreateEvent: (day: MonthDay) => void
  onEventClick: (id: string) => void
}) => {
  return (
    <div
      className="col-span-7 relative grid grid-cols-7 border-b border-border"
      style={{
        gridTemplateRows: `repeat(${maxAllDayLane + 1}, minmax(18px, auto))`,
      }}
    >
      {/* Background + borders */}
      {weekDays.map((day, i) => (
        <AllDayContextMenu key={day.dateKey} onCreateEvent={() => onCreateEvent(day)}>
          <div
            className={cn(
              "border-r border-border",
              day.dateKey === activeDateKey
                ? "bg-buttonSecondaryBgHover"
                : day.isWeekend && "bg-weekendBg",
            )}
            style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
            onContextMenu={(e) => {
              contextTargetRef.current = e.currentTarget
            }}
          />
        </AllDayContextMenu>
      ))}

      {/* All-day event bars */}
      {allDayItems.map((item) => (
        <WeekAllDayBar
          key={item.event.id}
          item={item}
          isActive={activeEventId === item.event.id}
          isPending={isPendingEvent(item.event, calendars)}
          isDeclined={isDeclinedEvent(item.event, calendars)}
          isDraft={item.event === draftEvent}
          onClick={() => onEventClick(item.event.id)}
        />
      ))}
    </div>
  )
}
