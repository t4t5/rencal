import { Temporal } from "@js-temporal/polyfill"
import { type CSSProperties, type RefObject, useLayoutEffect, useRef } from "react"

import {
  ACTIVE_DAY_ID,
  atTime,
  cn,
  ContextMenu,
  dragScrollProps,
  dropZoneProps,
  epochDay,
  formatWallclockTime,
  formatWeekday,
  startOfWeek,
  type TimeFormat,
  useDisplaySettings,
  useIsDimmed,
  useNavigation,
  useOpenDraft,
  useTimedDragToCreate,
  useViewerTzid,
} from "@/sdk"

import { WeekAllDayBar } from "./AllDayEventBlock"
import { CurrentTimeIndicator } from "./CurrentTimeIndicator"
import { DragToCreateSelection } from "./DragToCreateSelection"
import { WeekTimedEvent } from "./TimedEventBlock"
import { DAY_MINUTES, GRID_HEIGHT, GUTTER_WIDTH, HOUR_HEIGHT } from "./grid"
import type { AllDayLaneItem, WeekTimedEventLayout } from "./useDayRangeLayout"
import { TRACK_DAYS, type WeekDay } from "./useInfiniteDays"

/** Where a timed draft opens: the element and the viewport Y it was asked for at. */
type CreateTarget = { el: HTMLElement; y: number }

type WeekTimeGridProps = {
  /** The first day of the scroll track; `days` start `startIndex` days after it. */
  origin: Temporal.PlainDate
  startIndex: number
  days: WeekDay[]
  dayWidth: number
  dayWidthMeasured: boolean
  timedByDay: Map<string, WeekTimedEventLayout[]>
  allDayItems: AllDayLaneItem[]
  maxAllDayLane: number
  scrollContainerRef: RefObject<HTMLDivElement | null>
}

export function WeekTimeGrid({
  origin,
  startIndex,
  days,
  dayWidth,
  dayWidthMeasured,
  timedByDay,
  allDayItems,
  maxAllDayLane,
  scrollContainerRef,
}: WeekTimeGridProps) {
  const { activeDate, goToDate, navigationVersion } = useNavigation()
  const { timeFormat, firstDayOfWeek, loaded: settingsLoaded } = useDisplaySettings()
  const tzid = useViewerTzid()
  const openDraft = useOpenDraft()
  const { selection, startCreateDrag } = useTimedDragToCreate(scrollContainerRef)
  const dimmed = useIsDimmed()

  const activeDateKey = activeDate.toString()
  const N = days.length
  const hasAllDay = allDayItems.length > 0
  const allDayTargetRef = useRef<HTMLElement | null>(null)
  const timedTargetRef = useRef<CreateTarget | null>(null)

  // scrollLeft that puts the first day of `date`'s week right of the gutter.
  const weekScrollLeft = (date: Temporal.PlainDate, width: number) =>
    (epochDay(startOfWeek(date, firstDayOfWeek)) - epochDay(origin)) * width

  // Theme padding, font loading, or a window resize can change the tracks.
  // Preserve the visible day offset after the new track widths reach the DOM.
  const didInitialScrollRef = useRef(false)
  const previousDayWidthRef = useRef(dayWidth)
  useLayoutEffect(() => {
    const previousWidth = previousDayWidthRef.current
    previousDayWidthRef.current = dayWidth
    const el = scrollContainerRef.current
    if (el && didInitialScrollRef.current && previousWidth !== dayWidth) {
      el.scrollLeft = (el.scrollLeft / previousWidth) * dayWidth
    }
  }, [dayWidth, scrollContainerRef])

  // Initial scroll (once dayWidth is measured and settings are loaded, since week
  // alignment depends on firstDayOfWeek): scrollTop to current time / 08:00,
  // scrollLeft to the first day of activeDate's week.
  useLayoutEffect(() => {
    if (!dayWidthMeasured || !settingsLoaded || didInitialScrollRef.current) return
    const el = scrollContainerRef.current
    if (!el) return

    const hasToday = days.some((d) => d.isToday)
    const now = Temporal.Now.zonedDateTimeISO(tzid)
    const targetHour = hasToday ? now.hour + now.minute / 60 : 8
    el.scrollTop = Math.max(0, targetHour * HOUR_HEIGHT - 16)
    el.scrollLeft = weekScrollLeft(activeDate, dayWidth)

    didInitialScrollRef.current = true
  })

  // Recheck visibility on date changes and deliberate jumps, including to the same date.
  // Only those: re-running on scroll-driven growth would snap back to activeDate and
  // break free pan. A new track, or a target too far away to scroll through smoothly, jumps.
  const dayWidthRef = useRef(dayWidth)
  dayWidthRef.current = dayWidth
  const previousOriginRef = useRef(origin)
  useLayoutEffect(() => {
    const originChanged = !previousOriginRef.current.equals(origin)
    previousOriginRef.current = origin
    if (!didInitialScrollRef.current) return
    const el = scrollContainerRef.current
    if (!el) return
    const width = dayWidthRef.current

    const columnLeft = GUTTER_WIDTH + (epochDay(activeDate) - epochDay(origin)) * width
    const columnRight = columnLeft + width
    const viewportLeft = el.scrollLeft + GUTTER_WIDTH
    const viewportRight = el.scrollLeft + el.clientWidth

    if (originChanged || columnLeft < viewportLeft - 1 || columnRight > viewportRight + 1) {
      const left = weekScrollLeft(activeDate, width)
      const far = Math.abs(left - el.scrollLeft) > 3 * el.clientWidth
      el.scrollTo({ left, behavior: originChanged || far ? "instant" : "smooth" })
    }
  }, [activeDateKey, navigationVersion, origin, scrollContainerRef])

  const createTimedEvent = (day: WeekDay, { el, y }: CreateTarget) => {
    const { top, height } = el.getBoundingClientRect()
    const minutes = ((y - top) / height) * DAY_MINUTES
    const startHour = Math.max(0, Math.min(23, Math.floor(minutes / 60)))
    openDraft(day.date, el, { allDay: false, start: atTime(day.date, startHour), anchorY: y })
  }

  const trackWidth = GUTTER_WIDTH + TRACK_DAYS * dayWidth
  const dayGridCols = `${GUTTER_WIDTH}px repeat(${N}, ${dayWidth}px)`

  return (
    <div
      ref={scrollContainerRef}
      {...dragScrollProps}
      data-slot="week-scroll"
      style={{ "--week-hour-height": `${HOUR_HEIGHT}px` } as CSSProperties}
      className={cn("h-full w-full min-w-0 overflow-auto", selection && "select-none")}
    >
      <div style={{ width: trackWidth, minHeight: "100%" }}>
        {/* The rendered days, at their own offset on the track */}
        <div style={{ marginLeft: startIndex * dayWidth, width: GUTTER_WIDTH + N * dayWidth }}>
          {/* Zone 1+2: Day headers + all-day bars share one grid so column tracks
            line up exactly with the time grid below. */}
          <div
            data-slot="week-header"
            className="sticky top-0 z-20 bg-background grid"
            style={{
              gridTemplateColumns: dayGridCols,
              gridTemplateRows: hasAllDay
                ? // Edge tracks pad the lanes to match the 2px gap between them (bottom loses 1px to the border):
                  `auto 1px repeat(${maxAllDayLane + 1}, minmax(18px, auto)) 2px`
                : "auto",
            }}
          >
            {/* Gutter spacer — sticky left, spans all rows */}
            <div
              data-slot="week-header-gutter"
              className="sticky left-0 z-30 bg-background border-r border-b border-border"
              style={{ gridColumn: 1, gridRow: "1 / -1" }}
            />
            <DayHeaders
              days={days}
              activeDateKey={activeDateKey}
              dimmed={dimmed}
              onDayClick={goToDate}
            />
            {hasAllDay && (
              <>
                {/* Per-day backgrounds for the all-day region */}
                {days.map((day, i) => (
                  <ContextMenu
                    key={`${day.dateKey}-allday-bg`}
                    items={[
                      {
                        label: "Create event",
                        onSelect: () =>
                          openDraft(day.date, allDayTargetRef.current!, { allDay: true }),
                      },
                    ]}
                  >
                    <div
                      className={cn(
                        "border-r border-b border-border",
                        day.dateKey === activeDateKey
                          ? "bg-selected text-selected-foreground"
                          : day.isWeekend && "bg-weekend",
                      )}
                      style={{ gridColumn: i + 2, gridRow: "2 / -1" }}
                      data-slot="week-all-day"
                      data-selected={day.dateKey === activeDateKey || undefined}
                      data-weekend={day.isWeekend || undefined}
                      {...dropZoneProps(day.date, "all-day")}
                      onContextMenu={(e) => {
                        allDayTargetRef.current = e.currentTarget
                      }}
                      onDoubleClick={(e) => openDraft(day.date, e.currentTarget, { allDay: true })}
                    />
                  </ContextMenu>
                ))}
                {allDayItems.map((item) => (
                  <WeekAllDayBar key={item.event.key} item={item} colOffset={1} rowOffset={2} />
                ))}
              </>
            )}
          </div>

          {/* Zone 3: Time grid (horizontally and vertically scrollable) */}
          <div
            data-slot="week-time-grid"
            className="grid relative"
            style={{ gridTemplateColumns: dayGridCols, height: GRID_HEIGHT }}
          >
            <div
              data-slot="week-time-gutter"
              className="sticky left-0 z-10 bg-background border-r border-border"
            >
              <TimeGutter timeFormat={timeFormat} />
            </div>
            {days.map((day) => (
              <ContextMenu
                key={day.dateKey}
                items={[
                  {
                    label: "Create event",
                    onSelect: () => createTimedEvent(day, timedTargetRef.current!),
                  },
                ]}
              >
                <div
                  className={cn(
                    "relative border-r border-border cursor-default",
                    day.dateKey === activeDateKey
                      ? "bg-selected text-selected-foreground"
                      : day.isWeekend && "bg-weekend",
                  )}
                  style={{
                    backgroundImage: `var(--week-grid-background, repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT}px))`,
                  }}
                  id={day.dateKey === activeDateKey ? ACTIVE_DAY_ID : undefined}
                  {...dropZoneProps(day.date, "timed")}
                  data-slot="week-day"
                  data-selected={day.dateKey === activeDateKey || undefined}
                  data-weekend={day.isWeekend || undefined}
                  onPointerDown={(event) => startCreateDrag(day.date, event)}
                  onClick={() => goToDate(day.date)}
                  onContextMenu={(e) => {
                    timedTargetRef.current = { el: e.currentTarget, y: e.clientY }
                  }}
                  onDoubleClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-event-clickable]")) return
                    createTimedEvent(day, { el: e.currentTarget, y: e.clientY })
                  }}
                >
                  {(timedByDay.get(day.dateKey) ?? []).map((layout) => (
                    <WeekTimedEvent key={layout.event.key} layout={layout} />
                  ))}

                  {selection?.day.equals(day.date) && (
                    <DragToCreateSelection selection={selection} />
                  )}

                  {day.isToday && <CurrentTimeIndicator />}
                </div>
              </ContextMenu>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function TimeGutter({ timeFormat }: { timeFormat: TimeFormat }) {
  return (
    <div className="relative" style={{ height: GRID_HEIGHT }}>
      {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => {
        return (
          <span
            key={h}
            data-slot="week-hour-label"
            data-typography="numerical"
            className="absolute right-1.5 text-2xs text-muted-foreground leading-none -translate-y-1/2 select-none"
            style={{ top: h * HOUR_HEIGHT }}
          >
            {formatWallclockTime(h, 0, timeFormat)}
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
  days: WeekDay[]
  activeDateKey: string
  dimmed: boolean
  onDayClick: (date: Temporal.PlainDate) => void
}) => {
  return days.map((day) => (
    <div
      key={day.dateKey}
      data-slot="week-day-header"
      data-typography="numerical"
      data-selected={day.dateKey === activeDateKey || undefined}
      data-weekend={day.isWeekend || undefined}
      className={cn(
        "flex items-baseline justify-end gap-1 border-r border-border p-0.5 pb-px cursor-default",
        day.dateKey === activeDateKey
          ? "bg-selected text-selected-foreground"
          : day.isWeekend && "bg-weekend",
      )}
      style={{ gridRow: 1 }}
      // Headers double as an all-day drop zone so multi-day bars can land here
      // even when no all-day lane is rendered yet.
      {...dropZoneProps(day.date, "all-day")}
      onClick={() => onDayClick(day.date)}
    >
      <span data-slot="week-weekday" className="text-2xs text-muted-foreground uppercase">
        {formatWeekday(day.date, "short")}
      </span>
      <span
        data-slot="week-day-number"
        data-today={day.isToday || undefined}
        className={cn(
          "text-xs font-medium w-7 h-7 flex items-center justify-center rounded-circle",
          day.isToday && "bg-today text-today-foreground",
          dimmed && "opacity-50",
        )}
      >
        {day.date.day}
      </span>
    </div>
  ))
}
