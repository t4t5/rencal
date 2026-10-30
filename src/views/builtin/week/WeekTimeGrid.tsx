import { Temporal } from "@js-temporal/polyfill"
import { type CSSProperties, type RefObject, useLayoutEffect, useRef } from "react"

import {
  cn,
  dayProps,
  epochDay,
  formatWallclockTime,
  formatWeekday,
  startOfWeek,
  type TimeFormat,
  useDayGrid,
  useDisplaySettings,
  useNavigation,
  useOnNavigate,
  useViewerTzid,
} from "@/sdk"

import { WeekAllDayBar } from "./AllDayEventBlock"
import { CurrentTimeIndicator } from "./CurrentTimeIndicator"
import { DragToCreateSelection } from "./DragToCreateSelection"
import { WeekTimedEvent } from "./TimedEventBlock"
import { GRID_HEIGHT, GUTTER_WIDTH, HOUR_HEIGHT } from "./grid"
import type { DayRangeLayout } from "./useDayRangeLayout"
import { TRACK_DAYS, type WeekDay } from "./useInfiniteDays"

type WeekTimeGridProps = {
  /** The first day of the scroll track; `days` start `startIndex` days after it. */
  origin: Temporal.PlainDate
  startIndex: number
  days: WeekDay[]
  dayWidth: number
  dayWidthMeasured: boolean
  layout: DayRangeLayout
  scrollContainerRef: RefObject<HTMLDivElement | null>
}

export function WeekTimeGrid({
  origin,
  startIndex,
  days,
  dayWidth,
  dayWidthMeasured,
  layout: { allDayBars, allDayLaneCount, timedByDay },
  scrollContainerRef,
}: WeekTimeGridProps) {
  const { activeDate, goToDate } = useNavigation()
  const { timeFormat, firstDayOfWeek } = useDisplaySettings()
  const tzid = useViewerTzid()
  const { selection } = useDayGrid()

  const activeDateKey = activeDate.toString()
  const N = days.length
  const hasAllDay = allDayBars.length > 0

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

  // Initial scroll (once dayWidth is measured): scrollTop to current time / 08:00,
  // scrollLeft to the first day of activeDate's week.
  useLayoutEffect(() => {
    if (!dayWidthMeasured || didInitialScrollRef.current) return
    const el = scrollContainerRef.current
    if (!el) return

    const hasToday = days.some((d) => d.isToday)
    const now = Temporal.Now.zonedDateTimeISO(tzid)
    const targetHour = hasToday ? now.hour + now.minute / 60 : 8
    el.scrollTop = Math.max(0, targetHour * HOUR_HEIGHT - 16)
    el.scrollLeft = weekScrollLeft(activeDate, dayWidth)

    didInitialScrollRef.current = true
  })

  // Bring activeDate's column into view if it isn't. A new track, or a target too far
  // away to scroll through smoothly, jumps.
  const revealedRef = useRef({ dateKey: activeDateKey, origin })
  const revealActiveDate = () => {
    const originChanged = !revealedRef.current.origin.equals(origin)
    revealedRef.current = { dateKey: activeDateKey, origin }
    if (!didInitialScrollRef.current) return
    const el = scrollContainerRef.current
    if (!el) return

    const columnLeft = GUTTER_WIDTH + (epochDay(activeDate) - epochDay(origin)) * dayWidth
    const columnRight = columnLeft + dayWidth
    const viewportLeft = el.scrollLeft + GUTTER_WIDTH
    const viewportRight = el.scrollLeft + el.clientWidth

    if (originChanged || columnLeft < viewportLeft - 1 || columnRight > viewportRight + 1) {
      const left = weekScrollLeft(activeDate, dayWidth)
      const far = Math.abs(left - el.scrollLeft) > 3 * el.clientWidth
      el.scrollTo({ left, behavior: originChanged || far ? "instant" : "smooth" })
    }
  }

  // Deliberate jumps, even to the date already selected.
  useOnNavigate(revealActiveDate)

  // Date changes from elsewhere too, like the agenda's scrolling, and a new track. Not
  // scroll-driven growth: that would snap back to activeDate and break free pan.
  useLayoutEffect(() => {
    const revealed = revealedRef.current
    if (revealed.dateKey === activeDateKey && revealed.origin.equals(origin)) return
    revealActiveDate()
  })

  const trackWidth = GUTTER_WIDTH + TRACK_DAYS * dayWidth
  const dayGridCols = `${GUTTER_WIDTH}px repeat(${N}, ${dayWidth}px)`
  // The rendered days, at their own offset on the track.
  const windowBox = { marginLeft: startIndex * dayWidth, width: GUTTER_WIDTH + N * dayWidth }

  return (
    <div
      ref={scrollContainerRef}
      data-slot="week-scroll"
      style={{ "--week-hour-height": `${HOUR_HEIGHT}px` } as CSSProperties}
      className={cn("h-full w-full min-w-0 overflow-auto", selection && "select-none")}
    >
      <div style={{ width: trackWidth, minHeight: "100%" }}>
        {/* The sticky header spans the whole track, so loading more days changes only
            what it draws, never where it sits: WebKitGTK can show a sticky layer at
            its new position a frame before its new content. */}
        <div className="sticky top-0 z-20">
          {/* Zone 1+2: Day headers + all-day bars share one grid so column tracks
            line up exactly with the time grid below. */}
          <div
            data-slot="week-header"
            className="bg-background grid"
            style={{
              ...windowBox,
              gridTemplateColumns: dayGridCols,
              gridTemplateRows: hasAllDay
                ? // Edge tracks pad the lanes to match the 2px gap between them (bottom loses 1px to the border):
                  `auto 1px repeat(${allDayLaneCount}, minmax(18px, auto)) 2px`
                : "auto",
            }}
          >
            {/* Gutter spacer — sticky left, spans all rows */}
            <div
              data-slot="week-header-gutter"
              className="sticky left-0 z-30 bg-background border-r border-b border-border"
              style={{ gridColumn: 1, gridRow: "1 / -1" }}
            />
            <DayHeaders days={days} activeDateKey={activeDateKey} onDayClick={goToDate} />
            {hasAllDay && (
              <>
                {/* Per-day backgrounds for the all-day region */}
                {days.map((day, i) => (
                  <div
                    key={`${day.dateKey}-allday-bg`}
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
                    {...dayProps(day.date, "all-day")}
                  />
                ))}
                {allDayBars.map((bar) => (
                  <WeekAllDayBar key={bar.item.key} bar={bar} colOffset={1} rowOffset={2} />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Zone 3: Time grid (horizontally and vertically scrollable) */}
        <div
          data-slot="week-time-grid"
          className="grid relative"
          style={{ ...windowBox, gridTemplateColumns: dayGridCols, height: GRID_HEIGHT }}
        >
          <div
            data-slot="week-time-gutter"
            className="sticky left-0 z-10 bg-background border-r border-border"
          >
            <TimeGutter timeFormat={timeFormat} />
          </div>
          {days.map((day) => (
            <div
              key={day.dateKey}
              className={cn(
                "relative border-r border-border cursor-default",
                day.dateKey === activeDateKey
                  ? "bg-selected text-selected-foreground"
                  : day.isWeekend && "bg-weekend",
              )}
              style={{
                backgroundImage: `var(--week-grid-background, repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT}px))`,
              }}
              {...dayProps(day.date, "timed")}
              data-slot="week-day"
              data-selected={day.dateKey === activeDateKey || undefined}
              data-weekend={day.isWeekend || undefined}
              onClick={() => goToDate(day.date)}
            >
              {(timedByDay.get(day.dateKey) ?? []).map((block) => (
                <WeekTimedEvent key={block.item.key} block={block} />
              ))}

              {selection?.kind === "timed" && selection.day.equals(day.date) && (
                <DragToCreateSelection selection={selection} />
              )}

              {day.isToday && <CurrentTimeIndicator />}
            </div>
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
  onDayClick,
}: {
  days: WeekDay[]
  activeDateKey: string
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
      // Headers double as all-day days so multi-day bars can land here, and
      // all-day events be created, even when no all-day lane is rendered yet.
      {...dayProps(day.date, "all-day")}
      onClick={() => onDayClick(day.date)}
    >
      <span data-slot="week-weekday" className="text-2xs text-muted-foreground uppercase">
        {formatWeekday(day.date, "short")}
      </span>
      <span
        data-slot="week-day-number"
        data-today={day.isToday || undefined}
        className={cn(
          // Fades while the user types a new event in the header.
          "text-xs font-medium w-7 h-7 flex items-center justify-center rounded-circle in-data-dimmed:opacity-50",
          day.isToday && "bg-today text-today-foreground",
        )}
      >
        {day.date.day}
      </span>
    </div>
  ))
}
