import { addHours, endOfDay, format, setHours, startOfDay } from "date-fns"
import { useEffect, useRef } from "react"

import type { Calendar, CalendarEvent, TimeFormat } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"
import { useSettings } from "@/contexts/SettingsContext"

import type { AllDayLaneItem } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import type { WeekTimedEventLayout } from "@/hooks/cal-events/useWeekEventLayout"
import { setDraftAnchor } from "@/lib/draft-anchor"
import { isDeclinedEvent, isPendingEvent } from "@/lib/event-utils"
import { formatTime } from "@/lib/time"
import { cn } from "@/lib/utils"

import { AllDayContextMenu } from "./AllDayContextMenu"
import { CurrentTimeIndicator } from "./CurrentTimeIndicator"
import { ScheduledDayContextMenu } from "./ScheduledDayContextMenu"
import { WeekAllDayBar } from "./WeekAllDayBar"
import { WeekTimedEvent } from "./WeekTimedEvent"

const HOUR_HEIGHT = 56
const GRID_HEIGHT = 24 * HOUR_HEIGHT
const GUTTER_WIDTH = 48
const GRID_TEMPLATE_COLUMNS = `${GUTTER_WIDTH}px repeat(7, 1fr)`

type WeekTimeGridProps = {
  weekDays: MonthDay[]
  timedByCol: WeekTimedEventLayout[][]
  allDayItems: AllDayLaneItem[]
  maxAllDayLane: number
  activeEventId: string | null
  activeDateKey: string
  onDayClick: (date: Date) => void
  onEventClick: (id: string) => void
  draftEvent: CalendarEvent | null
  dimmed: boolean
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
  draftEvent,
  dimmed,
}: WeekTimeGridProps) {
  const { calendars } = useCalendars()
  const { setActiveEventId } = useCalEvents()
  const { setDraftEvent, setDraftPopoverOpen, setIsDrafting, defaultCalendarId } = useEventDraft()
  const { canCreate, promptToConnect } = useCreateEventGate()
  const { timeFormat } = useSettings()

  const todayColIndex = weekDays.findIndex((d) => d.isToday)
  const hasAllDay = allDayItems.length > 0
  const contextTargetRef = useRef<HTMLElement | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const didInitialScrollRef = useRef(false)

  useEffect(() => {
    if (didInitialScrollRef.current) return
    const el = scrollRef.current
    if (!el) return
    const hasToday = weekDays.some((d) => d.isToday)
    const now = new Date()
    const targetHour = hasToday ? now.getHours() + now.getMinutes() / 60 : 8
    el.scrollTop = Math.max(0, targetHour * HOUR_HEIGHT - 16)
    didInitialScrollRef.current = true
  }, [weekDays])

  const openCreatePopover = (
    day: Date,
    el: HTMLElement,
    opts: { allDay: boolean; startHour?: number; clickY?: number },
  ) => {
    if (!canCreate) {
      promptToConnect()
      return
    }
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

    if (opts.clickY != null) {
      const { left, width } = el.getBoundingClientRect()
      const y = opts.clickY
      setDraftAnchor({ getBoundingClientRect: () => new DOMRect(left, y, width, 0) })
    } else {
      setDraftAnchor(el)
    }
    setDraftPopoverOpen(true)
  }

  const getHourFromClickY = (el: HTMLElement, clientY: number) => {
    const rect = el.getBoundingClientRect()
    const fraction = (clientY - rect.top) / rect.height
    const hour = fraction * 24
    return Math.max(0, Math.min(23, Math.floor(hour)))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Zone 1: Day headers (fixed) */}
      <div className="grid" style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}>
        <div />
        <DayHeaders
          weekDays={weekDays}
          activeDateKey={activeDateKey}
          dimmed={dimmed}
          onDayClick={onDayClick}
        />
      </div>

      {/* Zone 2: All-day bar (fixed, only if present) */}
      {hasAllDay && (
        <div className="grid" style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}>
          <div className="border-r border-b border-divider" />
          <AllDayEvents
            maxAllDayLane={maxAllDayLane}
            weekDays={weekDays}
            activeDateKey={activeDateKey}
            contextTargetRef={contextTargetRef}
            allDayItems={allDayItems}
            activeEventId={activeEventId}
            calendars={calendars}
            draftEvent={draftEvent}
            dimmed={dimmed}
            onCreateEvent={(day: MonthDay) => {
              openCreatePopover(day.date, contextTargetRef.current!, { allDay: true })
            }}
            onEventClick={onEventClick}
          />
        </div>
      )}

      {/* Zone 3: Scrollable time area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          className="grid relative"
          style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS, height: GRID_HEIGHT }}
        >
          <TimeGutter timeFormat={timeFormat} />
          {weekDays.map((day, colIndex) => (
            <ScheduledDayContextMenu
              key={day.dateKey}
              onCreateEvent={(el, clickY) => {
                const startHour = getHourFromClickY(el, clickY)
                openCreatePopover(day.date, el, { allDay: false, startHour, clickY })
              }}
            >
              <div
                className={cn(
                  "relative border-r border-divider cursor-default",
                  day.dateKey === activeDateKey
                    ? "bg-secondary-hover"
                    : day.isWeekend && "bg-weekend",
                )}
                style={
                  {
                    "--day-bg":
                      day.dateKey === activeDateKey
                        ? "var(--secondary-hover)"
                        : day.isWeekend
                          ? "var(--weekend)"
                          : "var(--background)",
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT - 1}px, var(--divider) ${HOUR_HEIGHT - 1}px, var(--divider) ${HOUR_HEIGHT}px)`,
                  } as React.CSSProperties
                }
                onClick={() => onDayClick(day.date)}
              >
                {timedByCol[colIndex].map((layout) => (
                  <WeekTimedEvent
                    key={layout.event.id}
                    layout={layout}
                    isActive={activeEventId === layout.event.id}
                    isPending={isPendingEvent(layout.event, calendars)}
                    isDeclined={isDeclinedEvent(layout.event, calendars)}
                    isDraft={layout.event === draftEvent}
                    dimmed={dimmed}
                    onClick={() => onEventClick(layout.event.id)}
                  />
                ))}

                {colIndex === todayColIndex && <CurrentTimeIndicator />}
              </div>
            </ScheduledDayContextMenu>
          ))}
        </div>
      </div>
    </div>
  )
}

function TimeGutter({ timeFormat }: { timeFormat: TimeFormat }) {
  return (
    <div className="relative border-r border-divider">
      {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => {
        const d = new Date()
        d.setHours(h, 0, 0, 0)
        return (
          <span
            key={h}
            className="absolute right-1.5 text-[11px] text-muted-foreground font-numerical leading-none -translate-y-1/2 select-none"
            style={{ top: h * HOUR_HEIGHT }}
          >
            {formatTime(d, timeFormat)}
          </span>
        )
      })}
    </div>
  )
}

const DayHeaders = ({
  weekDays,
  activeDateKey,
  dimmed,
  onDayClick,
}: {
  weekDays: MonthDay[]
  activeDateKey: string
  dimmed: boolean
  onDayClick: (date: Date) => void
}) => {
  return weekDays.map((day) => (
    <div
      key={day.dateKey}
      className={cn(
        "flex items-baseline justify-end gap-1 border-r border-divider p-0.5 pb-px cursor-default font-numerical",
        day.dateKey === activeDateKey ? "bg-secondary-hover" : day.isWeekend && "bg-weekend",
      )}
      onClick={() => onDayClick(day.date)}
    >
      <span className="text-[11px] text-muted-foreground uppercase">{format(day.date, "EEE")}</span>
      <span
        className={cn(
          "text-[13px] font-medium w-7 h-7 flex items-center justify-center rounded-circle",
          day.isToday && "bg-today text-primary-foreground",
          dimmed && "opacity-50",
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
  dimmed,
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
  dimmed: boolean
  onCreateEvent: (day: MonthDay) => void
  onEventClick: (id: string) => void
}) => {
  return (
    <div
      className="relative grid grid-cols-7 border-b border-divider"
      style={{
        gridColumn: "2 / -1",
        gridTemplateRows: `repeat(${maxAllDayLane + 1}, minmax(18px, auto))`,
      }}
    >
      {/* Background + borders */}
      {weekDays.map((day, i) => (
        <AllDayContextMenu key={day.dateKey} onCreateEvent={() => onCreateEvent(day)}>
          <div
            className={cn(
              "border-r border-divider",
              day.dateKey === activeDateKey ? "bg-secondary-hover" : day.isWeekend && "bg-weekend",
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
          dimmed={dimmed}
          onClick={() => onEventClick(item.event.id)}
        />
      ))}

      {weekDays.map((day) => (
        <div
          className={cn(
            "h-px border-r border-divider",
            day.dateKey === activeDateKey ? "bg-secondary-hover" : day.isWeekend && "bg-weekend",
          )}
        />
      ))}
    </div>
  )
}
