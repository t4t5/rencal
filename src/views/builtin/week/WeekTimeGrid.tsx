import { Temporal } from "@js-temporal/polyfill"
import { type CSSProperties, type RefObject, useLayoutEffect, useRef } from "react"

import {
  AddTimeZoneButton,
  cn,
  dayProps,
  epochDay,
  formatWallclockTime,
  formatWeekday,
  type TimeFormat,
  TimeZoneMenu,
  Tooltip,
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
import { useGutterZones } from "./useGutterZones"
import { firstVisibleDay, type Span, TRACK_DAYS, type WeekDay } from "./useInfiniteDays"
import { type GutterZone, hourInZone, zoneAbbreviation, zoneDescription } from "./zones"

type WeekTimeGridProps = {
  span: Span
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
  span,
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
  const zones = useGutterZones()
  const gutterWidth = zones.length * GUTTER_WIDTH

  const activeDateKey = activeDate.toString()
  // A day on its own is always the active one, so marking it selected says nothing.
  const selectedDateKey = span === "day" ? null : activeDateKey
  const N = days.length
  const hasAllDay = allDayBars.length > 0

  // scrollLeft that puts the first day shown with `date` right of the gutter.
  const spanScrollLeft = (date: Temporal.PlainDate, width: number) =>
    (epochDay(firstVisibleDay(date, span, firstDayOfWeek)) - epochDay(origin)) * width

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
  // scrollLeft to the first day shown with activeDate.
  useLayoutEffect(() => {
    if (!dayWidthMeasured || didInitialScrollRef.current) return
    const el = scrollContainerRef.current
    if (!el) return

    const hasToday = days.some((d) => d.isToday)
    const now = Temporal.Now.zonedDateTimeISO(tzid)
    const targetHour = hasToday ? now.hour + now.minute / 60 : 8
    el.scrollTop = Math.max(0, targetHour * HOUR_HEIGHT - 16)
    el.scrollLeft = spanScrollLeft(activeDate, dayWidth)

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

    const columnLeft = gutterWidth + (epochDay(activeDate) - epochDay(origin)) * dayWidth
    const columnRight = columnLeft + dayWidth
    const viewportLeft = el.scrollLeft + gutterWidth
    const viewportRight = el.scrollLeft + el.clientWidth

    if (originChanged || columnLeft < viewportLeft - 1 || columnRight > viewportRight + 1) {
      const left = spanScrollLeft(activeDate, dayWidth)
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

  const trackWidth = gutterWidth + TRACK_DAYS * dayWidth
  const dayGridCols = `${gutterWidth}px repeat(${N}, ${dayWidth}px)`
  // The rendered days, at their own offset on the track.
  const windowBox = { marginLeft: startIndex * dayWidth, width: gutterWidth + N * dayWidth }

  return (
    <div
      ref={scrollContainerRef}
      data-slot="week-scroll"
      data-span={span}
      style={
        {
          "--week-hour-height": `${HOUR_HEIGHT}px`,
          "--week-gutter-width": `${gutterWidth}px`,
        } as CSSProperties
      }
      className={cn(
        "h-full w-full min-w-0",
        // A day never rests between two days: only navigation moves it sideways.
        span === "day" ? "overflow-x-hidden overflow-y-auto" : "overflow-auto",
        selection && "select-none",
      )}
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
            >
              {/* One zone needs no name: every time on screen is in it. Once zones are
                  named, their menus add more: a "+" beside them would cover a name. */}
              {zones.length > 1 ? (
                <ZoneLabels zones={zones} date={activeDate} />
              ) : (
                <div className="h-7.5 pl-1 flex items-center">
                  <Tooltip content="Add time zone" side="bottom">
                    <AddTimeZoneButton />
                  </Tooltip>
                </div>
              )}
            </div>
            <DayHeaders
              days={days}
              span={span}
              hasAllDay={hasAllDay}
              selectedDateKey={selectedDateKey}
              onDayClick={goToDate}
            />
            {hasAllDay && (
              <>
                {/* Per-day backgrounds for the all-day region */}
                {days.map((day, i) => (
                  <div
                    key={`${day.dateKey}-allday-bg`}
                    className={cn(
                      "border-r border-b border-border",
                      day.dateKey === selectedDateKey
                        ? "bg-selected text-selected-foreground"
                        : isWeekend(day, span) && "bg-weekend",
                    )}
                    style={{ gridColumn: i + 2, gridRow: "2 / -1" }}
                    data-slot="week-all-day"
                    data-selected={day.dateKey === selectedDateKey || undefined}
                    data-weekend={isWeekend(day, span) || undefined}
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
            <TimeGutter zones={zones} date={activeDate} viewerTzid={tzid} timeFormat={timeFormat} />
          </div>
          {days.map((day) => (
            <div
              key={day.dateKey}
              className={cn(
                "relative border-r border-border cursor-default",
                day.dateKey === selectedDateKey
                  ? "bg-selected text-selected-foreground"
                  : isWeekend(day, span) && "bg-weekend",
              )}
              style={{
                backgroundImage: `var(--week-grid-background, repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT}px))`,
              }}
              {...dayProps(day.date, "timed")}
              data-slot="week-day"
              data-selected={day.dateKey === selectedDateKey || undefined}
              data-weekend={isWeekend(day, span) || undefined}
              onClick={() => goToDate(day.date)}
            >
              {(timedByDay.get(day.dateKey) ?? []).map((block) => (
                <WeekTimedEvent key={block.item.key} block={block} />
              ))}

              {selection?.kind === "timed" && (
                <DragToCreateSelection selection={selection} date={day.date} />
              )}

              {day.isToday && <CurrentTimeIndicator inset={span === "day"} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// A lone day has no weekdays beside it to stand apart from.
const isWeekend = (day: WeekDay, span: Span) => span === "week" && day.isWeekend

const formatZoneHour = ({ hour, minute }: { hour: number; minute: number }, format: TimeFormat) =>
  formatWallclockTime(hour, minute, format)

/**
 * One column of hour labels per zone. The grid's hours are the viewer's; the other zones
 * read them as they fall on `date`, since a zone's offset can change from one day to the next.
 */
function TimeGutter({
  zones,
  date,
  viewerTzid,
  timeFormat,
}: {
  zones: GutterZone[]
  date: Temporal.PlainDate
  viewerTzid: string
  timeFormat: TimeFormat
}) {
  return (
    <div className="flex" style={{ height: GRID_HEIGHT }}>
      {zones.map(({ tzid, local }) => (
        <div
          key={tzid}
          data-slot="week-time-zone"
          data-local={local || undefined}
          className="relative"
          style={{ width: GUTTER_WIDTH }}
        >
          {Array.from({ length: 23 }, (_, i) => i + 1).map((hour) => (
            <span
              key={hour}
              data-slot="week-hour-label"
              data-typography="numerical"
              className={cn(
                "absolute right-1.5 text-2xs text-muted-foreground leading-none -translate-y-1/2 select-none whitespace-nowrap",
                !local && "opacity-70",
              )}
              style={{ top: hour * HOUR_HEIGHT }}
            >
              {formatZoneHour(hourInZone(date, hour, viewerTzid, tzid), timeFormat)}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Names the gutter's columns, at the height of the day headers. Extra zones open a menu. */
function ZoneLabels({ zones, date }: { zones: GutterZone[]; date: Temporal.PlainDate }) {
  return (
    <div className="flex">
      {zones.map(({ tzid, local }) => {
        const name = zoneAbbreviation(tzid, date)
        return (
          <div
            key={tzid}
            data-slot="week-zone-label"
            data-local={local || undefined}
            className={cn(
              "h-7.5 pr-1 flex items-center justify-end text-2xs text-muted-foreground leading-none whitespace-nowrap overflow-hidden select-none",
              !local && "opacity-70",
            )}
            style={{ width: GUTTER_WIDTH }}
          >
            <Tooltip content={zoneDescription(tzid, date)} side="bottom">
              {local ? (
                <span className="px-1 cursor-default">{name}</span>
              ) : (
                <TimeZoneMenu tzid={tzid}>
                  <button
                    type="button"
                    className="px-1 py-1 rounded-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent aria-expanded:bg-accent"
                  >
                    {name}
                  </button>
                </TimeZoneMenu>
              )}
            </Tooltip>
          </div>
        )
      })}
    </div>
  )
}

const DayHeaders = ({
  days,
  span,
  hasAllDay,
  selectedDateKey,
  onDayClick,
}: {
  days: WeekDay[]
  span: Span
  hasAllDay: boolean
  selectedDateKey: string | null
  onDayClick: (date: Temporal.PlainDate) => void
}) => {
  return days.map((day) => (
    <div
      key={day.dateKey}
      data-slot="week-day-header"
      data-typography="numerical"
      data-selected={day.dateKey === selectedDateKey || undefined}
      data-weekend={isWeekend(day, span) || undefined}
      className={cn(
        "flex items-baseline gap-1 border-r border-border p-0.5 pb-px cursor-default",
        // The all-day lane draws the line under the headers; without it, they do.
        !hasAllDay && "border-b",
        // A lone day reads from the left, like its events; a week's dates line up on the right.
        span === "day" ? "justify-start pl-2" : "justify-end",
        day.dateKey === selectedDateKey
          ? "bg-selected text-selected-foreground"
          : isWeekend(day, span) && "bg-weekend",
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
