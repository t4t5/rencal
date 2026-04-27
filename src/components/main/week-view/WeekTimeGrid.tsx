import { addHours, format, setHours, startOfDay, startOfWeek } from "date-fns"
import { RefObject, useEffect, useLayoutEffect, useRef, useState } from "react"

import type { TimeFormat } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"
import { useSettings } from "@/contexts/SettingsContext"

import type { WeekTimedEventLayout } from "@/hooks/cal-events/useDayRangeLayout"
import type { AllDayLaneItem } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import type { CalendarEvent } from "@/lib/cal-events"
import { setDraftAnchor } from "@/lib/draft-anchor"
import {
  addDays,
  dateToPlainDate,
  formatDateKey,
  formatTime,
  fromDate,
  getLocalTzid,
  type EventDateTime,
} from "@/lib/event-time"
import { isDeclinedEvent, isPendingEvent } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

import { AllDayContextMenu } from "./AllDayContextMenu"
import { CurrentTimeIndicator } from "./CurrentTimeIndicator"
import { ScheduledDayContextMenu } from "./ScheduledDayContextMenu"
import { WeekAllDayBar } from "./WeekAllDayBar"
import { WeekTimedEvent } from "./WeekTimedEvent"

const HOUR_HEIGHT = 56
const GRID_HEIGHT = 24 * HOUR_HEIGHT
const GUTTER_WIDTH = 48
const DAY_WIDTH_MIN = 100

// How long to wait after a scroll event before considering the scroll "settled"
// and updating the activeDate based on the scroll position.
const SCROLL_SETTLE_MS = 300

type WeekTimeGridProps = {
  days: MonthDay[]
  timedByDay: Map<string, WeekTimedEventLayout[]>
  allDayItems: AllDayLaneItem[]
  maxAllDayLane: number
  activeEventId: string | null
  activeDateKey: string
  scrollContainerRef: RefObject<HTMLDivElement | null>
  onDayClick: (date: Date) => void
  onScrollActiveChange: (date: Date) => void
  onEventClick: (id: string) => void
  draftEvent: CalendarEvent | null
  dimmed: boolean
}

export function WeekTimeGrid({
  days,
  timedByDay,
  allDayItems,
  maxAllDayLane,
  activeEventId,
  activeDateKey,
  scrollContainerRef,
  onDayClick,
  onScrollActiveChange,
  onEventClick,
  draftEvent,
  dimmed,
}: WeekTimeGridProps) {
  const { calendars } = useCalendars()
  const { setActiveEventId } = useCalEvents()
  const { setDraftEvent, setDraftPopoverOpen, setIsDrafting, defaultCalendarId } = useEventDraft()
  const { canCreate, promptToConnect } = useCreateEventGate()
  const { timeFormat } = useSettings()

  const N = days.length
  const hasAllDay = allDayItems.length > 0
  const contextTargetRef = useRef<HTMLElement | null>(null)

  // Used to suppress the "update activeDate on scroll" logic during our own programmatic scrolls.
  const ignoreScrollUntilRef = useRef(0)
  const suppressScrollTracking = (durationMs = 500) => {
    ignoreScrollUntilRef.current = Date.now() + durationMs
  }

  // Day width is computed so 7 days fit in the viewport (min-floored).
  // The `ready` flag gates the initial-scroll effect until the width is measured against the real container.
  const [dayWidth, setDayWidth] = useState(180)
  const [dayWidthReady, setDayWidthReady] = useState(false)
  useLayoutEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const update = () => {
      const w = Math.max(DAY_WIDTH_MIN, (el.clientWidth - GUTTER_WIDTH) / 7)
      setDayWidth(w)
      setDayWidthReady(true)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scrollContainerRef])

  // Adjust scrollLeft when days are prepended, so the viewport stays over the same content.
  // Detect prepend: the previous firstKey must still be present at position `added` in the new array.
  const prevFirstKeyRef = useRef<string | undefined>(days[0]?.dateKey)
  const prevCountRef = useRef(days.length)
  useLayoutEffect(() => {
    const el = scrollContainerRef.current
    const curFirstKey = days[0]?.dateKey
    const prevFirstKey = prevFirstKeyRef.current
    const prevCount = prevCountRef.current
    prevFirstKeyRef.current = curFirstKey
    prevCountRef.current = days.length
    if (!el || !curFirstKey || !prevFirstKey) return
    if (curFirstKey === prevFirstKey) return
    const added = days.length - prevCount
    if (added > 0 && days[added]?.dateKey === prevFirstKey) {
      suppressScrollTracking()
      el.scrollLeft += added * dayWidth
    }
  })

  // Initial scroll (once dayWidth is measured): scrollTop to current time / 08:00, scrollLeft to Monday of activeDate's week.
  const didInitialScrollRef = useRef(false)
  useLayoutEffect(() => {
    if (!dayWidthReady || didInitialScrollRef.current) return
    const el = scrollContainerRef.current
    if (!el) return

    suppressScrollTracking()
    const hasToday = days.some((d) => d.isToday)
    const now = new Date()
    const targetHour = hasToday ? now.getHours() + now.getMinutes() / 60 : 8
    el.scrollTop = Math.max(0, targetHour * HOUR_HEIGHT - 16)

    const activeDay = days.find((d) => d.dateKey === activeDateKey)
    if (activeDay) {
      const weekStartKey = formatDateKey(startOfWeek(activeDay.date, { weekStartsOn: 1 }))
      const mondayIdx = days.findIndex((d) => d.dateKey === weekStartKey)
      if (mondayIdx !== -1) el.scrollLeft = mondayIdx * dayWidth
    }

    didInitialScrollRef.current = true
  }, [dayWidthReady, days, dayWidth, activeDateKey, scrollContainerRef])

  // After initial scroll, whenever activeDate changes to an off-screen day, smooth-scroll it into view.
  // Deps are intentionally only activeDateKey — if we include `days` / `dayWidth`, the effect
  // re-fires on edge-growth and snaps the scroll back to activeDate, breaking free pan.
  const daysRef = useRef(days)
  const dayWidthRef = useRef(dayWidth)
  daysRef.current = days
  dayWidthRef.current = dayWidth
  useLayoutEffect(() => {
    if (!didInitialScrollRef.current) return
    const el = scrollContainerRef.current
    if (!el) return
    const currentDays = daysRef.current
    const currentDayWidth = dayWidthRef.current
    const idx = currentDays.findIndex((d) => d.dateKey === activeDateKey)
    if (idx === -1) return

    const columnLeft = GUTTER_WIDTH + idx * currentDayWidth
    const columnRight = columnLeft + currentDayWidth
    const viewportLeft = el.scrollLeft + GUTTER_WIDTH
    const viewportRight = el.scrollLeft + el.clientWidth

    if (columnLeft < viewportLeft - 1 || columnRight > viewportRight + 1) {
      suppressScrollTracking()
      el.scrollTo({ left: idx * currentDayWidth, behavior: "smooth" })
    }
  }, [activeDateKey, scrollContainerRef])

  // When user stops scrolling, set activeDate to whatever day is the leftmost fully-visible column.
  const activeDateKeyRef = useRef(activeDateKey)
  activeDateKeyRef.current = activeDateKey
  const onScrollActiveChangeRef = useRef(onScrollActiveChange)
  onScrollActiveChangeRef.current = onScrollActiveChange
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    let debounceTimer: number | null = null
    let lastScrollLeft = el.scrollLeft

    const onScroll = () => {
      if (Date.now() < ignoreScrollUntilRef.current) return
      if (el.scrollLeft === lastScrollLeft) return // vertical-only scroll
      lastScrollLeft = el.scrollLeft

      if (debounceTimer !== null) window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => {
        const currentDays = daysRef.current
        const currentDayWidth = dayWidthRef.current
        if (currentDayWidth === 0 || currentDays.length === 0) return
        const idx = Math.min(
          currentDays.length - 1,
          Math.max(0, Math.ceil(el.scrollLeft / currentDayWidth)),
        )
        const day = currentDays[idx]
        if (!day || day.dateKey === activeDateKeyRef.current) return
        onScrollActiveChangeRef.current(day.date)
      }, SCROLL_SETTLE_MS)
    }

    el.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      el.removeEventListener("scroll", onScroll)
      if (debounceTimer !== null) window.clearTimeout(debounceTimer)
    }
  }, [scrollContainerRef])

  const openCreatePopover = (
    day: Date,
    el: HTMLElement,
    opts: { allDay: boolean; startHour?: number; clickY?: number },
  ) => {
    if (!canCreate) {
      promptToConnect()
      return
    }
    const tzid = getLocalTzid()
    let start: EventDateTime
    let end: EventDateTime
    if (opts.allDay) {
      start = dateToPlainDate(day)
      end = addDays(start, 1)
    } else {
      const startJs = setHours(startOfDay(day), opts.startHour ?? 0)
      start = fromDate(startJs, tzid)
      end = fromDate(addHours(startJs, 1), tzid)
    }

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

  const totalContentWidth = GUTTER_WIDTH + N * dayWidth
  const dayGridCols = `${GUTTER_WIDTH}px repeat(${N}, ${dayWidth}px)`

  return (
    <div ref={scrollContainerRef} className="h-full w-full min-w-0 overflow-auto">
      <div style={{ width: totalContentWidth, minHeight: "100%" }}>
        {/* Zone 1+2: Day headers + all-day bars share one grid so column tracks
            line up exactly with the time grid below. */}
        <div
          className="sticky top-0 z-20 bg-background grid"
          style={{
            gridTemplateColumns: dayGridCols,
            gridTemplateRows: hasAllDay
              ? `auto repeat(${maxAllDayLane + 1}, minmax(18px, auto))`
              : "auto",
          }}
        >
          {/* Gutter spacer — sticky left, spans all rows */}
          <div
            className="sticky left-0 z-30 bg-background border-r border-b border-divider"
            style={{ gridColumn: 1, gridRow: "1 / -1" }}
          />
          <DayHeaders
            days={days}
            activeDateKey={activeDateKey}
            dimmed={dimmed}
            onDayClick={onDayClick}
          />
          {hasAllDay && (
            <>
              {/* Per-day backgrounds for the all-day region */}
              {days.map((day, i) => (
                <AllDayContextMenu
                  key={`${day.dateKey}-allday-bg`}
                  onCreateEvent={() =>
                    openCreatePopover(day.date, contextTargetRef.current!, { allDay: true })
                  }
                >
                  <div
                    className={cn(
                      "border-r border-b border-divider",
                      day.dateKey === activeDateKey
                        ? "bg-secondary-hover"
                        : day.isWeekend && "bg-weekend",
                    )}
                    style={{ gridColumn: i + 2, gridRow: "2 / -1" }}
                    onContextMenu={(e) => {
                      contextTargetRef.current = e.currentTarget
                    }}
                  />
                </AllDayContextMenu>
              ))}
              {allDayItems.map((item) => (
                <WeekAllDayBar
                  key={item.event.id}
                  item={item}
                  colOffset={1}
                  rowOffset={1}
                  isActive={activeEventId === item.event.id}
                  isPending={isPendingEvent(item.event, calendars)}
                  isDeclined={isDeclinedEvent(item.event, calendars)}
                  isDraft={item.event === draftEvent}
                  dimmed={dimmed}
                  onClick={() => onEventClick(item.event.id)}
                />
              ))}
            </>
          )}
        </div>

        {/* Zone 3: Time grid (horizontally and vertically scrollable) */}
        <div
          className="grid relative"
          style={{ gridTemplateColumns: dayGridCols, height: GRID_HEIGHT }}
        >
          <div className="sticky left-0 z-10 bg-background border-r border-divider">
            <TimeGutter timeFormat={timeFormat} />
          </div>
          {days.map((day) => (
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
                {(timedByDay.get(day.dateKey) ?? []).map((layout) => (
                  <WeekTimedEvent
                    key={layout.event.id}
                    layout={layout}
                    isActive={activeEventId === layout.event.id}
                    isPending={isPendingEvent(layout.event, calendars)}
                    isDeclined={isDeclinedEvent(layout.event, calendars)}
                    isDraft={layout.event === draftEvent}
                    dimmed={dimmed}
                    onEventClick={onEventClick}
                  />
                ))}

                {day.isToday && <CurrentTimeIndicator />}
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
    <div className="relative" style={{ height: GRID_HEIGHT }}>
      {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => {
        const d = new Date()
        d.setHours(h, 0, 0, 0)
        return (
          <span
            key={h}
            className="absolute right-1.5 text-[11px] text-muted-foreground numerical leading-none -translate-y-1/2 select-none"
            style={{ top: h * HOUR_HEIGHT }}
          >
            {formatTime(fromDate(d), timeFormat)}
          </span>
        )
      })}
    </div>
  )
}

const DayHeaders = ({
  days,
  activeDateKey,
  dimmed,
  onDayClick,
}: {
  days: MonthDay[]
  activeDateKey: string
  dimmed: boolean
  onDayClick: (date: Date) => void
}) => {
  return days.map((day) => (
    <div
      key={day.dateKey}
      className={cn(
        "flex items-baseline justify-end gap-1 border-r border-divider p-0.5 pb-px cursor-default numerical",
        day.dateKey === activeDateKey ? "bg-secondary-hover" : day.isWeekend && "bg-weekend",
      )}
      style={{ gridRow: 1 }}
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
