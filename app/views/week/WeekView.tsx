import { Temporal } from "@js-temporal/polyfill"
import {
  cleanup,
  computed,
  createAnimatedValue,
  effect,
  type JSX,
  Scroll,
  type ScrollRef,
  signal,
  Text,
  untracked,
  View,
  type ViewRef,
} from "nsh"

import { AddTimeZoneButton, ZoneName } from "@/components/time-zones/TimeZoneControls"
import { Tooltip } from "@/components/ui/tooltip"

import { type DayArea, setDayAreas } from "@/lib/day-hits"
import {
  DAY_MINUTES,
  epochDay,
  formatWallclockTime,
  formatWeekday,
  getViewerTzid,
  plainDateFromEpochDay,
} from "@/lib/event-time"
import { type AllDayBar, layoutAllDay, type TimedBlock } from "@/lib/layout"
import { cn, FOCUS_RING } from "@/lib/utils"

import { activeDate, navigateToDate, onNavigate } from "@/stores/calendar"
import { currentDay, now, viewerTzid } from "@/stores/clock"
import {
  createDragHandlers,
  createEventAt,
  createSelection,
  selectionColor,
  selectionPartOn,
  setDragScroller,
} from "@/stores/drag"
import { extraTimeZones, timeFormat } from "@/stores/settings"
import { typography } from "@/themes"
import { openDayMenu } from "@/views/event-block"
import type { Spanning } from "@/views/month/layout"
import { trackWindow } from "@/views/track-window"
import { holdVisibleDays } from "@/views/visible-range"

import { AllDayBarBlock, LANE_HEIGHT, TimedEventBlock } from "./EventBlocks"
import { GRID_HEIGHT, GUTTER_WIDTH, HOUR_HEIGHT, selectionWidth, verticalBox } from "./grid"
import {
  centerTrack,
  firstVisibleIndex,
  type Span,
  TRACK_DAYS,
  trackOrigin,
  type TimedItem,
  VISIBLE_DAYS,
  weekEvents,
} from "./layout"
import { type GutterZone, hourInZone, zoneAbbreviation, zoneDescription } from "./zones"

/** Day column width: the span's days fill the viewport right of the gutter, never under this. */
const DAY_WIDTH_MIN = 100
const DAY_HEADER_HEIGHT = 31
/** Days kept beyond the viewport on each side. */
const OVERSCAN_DAYS = 3
/** All-day bars are packed over a stretch of this many days, so lanes hold still in a scroll. */
const LANE_RANGE_DAYS = 28
/** Days of events loaded beyond the viewport, and how close to their end they grow. */
const LOAD_BUFFER_DAYS = 42
const LOAD_EDGE_DAYS = 14
/** What a sticky all-day title keeps of its bar at the bar's end. */
const BAR_TITLE_ROOM = 48
/** Lanes are padded by these to match the gap between them. */
const LANES_TOP = 1
const LANES_BOTTOM = 2
/** How long the day view slides to a nearby day. */
const DAY_SLIDE_MS = 300
/** How far, in days, a day view's strip may show from the day its columns are laid out around. */
const SLIDE_REACH_DAYS = 3

const HOURS = Array.from({ length: 23 }, (_, i) => i + 1)

const dateOf = (index: number) => plainDateFromEpochDay(epochDay(trackOrigin()) + index)

// A lone day is always the active one, with no weekdays beside it to stand apart from.
function dayClass(date: Temporal.PlainDate, span: Span) {
  if (span === "day") return undefined
  if (date.equals(activeDate())) return "bg-selected text-selected-foreground"
  return date.dayOfWeek >= 6 ? "bg-weekend" : undefined
}

/**
 * One column of hour labels per zone. The grid's hours are the viewer's; the other zones
 * read them as they fall on the active date, since a zone's offset can change from one day to the next.
 */
function TimeGutter(props: { zones: () => GutterZone[] }) {
  return (
    <View
      class="flex-row border-r border-border bg-background shrink-0"
      style={{ width: props.zones().length * GUTTER_WIDTH, height: GRID_HEIGHT }}
    >
      <Each of={props.zones()} key={(zone) => zone.tzid}>
        {(zone) => (
          <View
            testID="week-time-zone"
            class={cn("relative flex-1", !zone().local && "opacity-70")}
          >
            <Each of={HOURS}>
              {(hour) => (
                <Text
                  class={cn(
                    typography.numericalSm(),
                    "absolute right-1.5 leading-none text-muted-foreground",
                  )}
                  style={{ top: hour() * HOUR_HEIGHT - 6 }}
                >
                  {(() => {
                    const there = hourInZone(activeDate(), hour(), viewerTzid(), zone().tzid)
                    return formatWallclockTime(there.hour, there.minute, timeFormat())
                  })()}
                </Text>
              )}
            </Each>
          </View>
        )}
      </Each>
    </View>
  )
}

/**
 * Above the gutter: one zone needs no name, since every time on screen is in it, so a
 * "+" adds another. Once zones are named, their menus add more.
 */
function GutterHeader(props: { zones: () => GutterZone[] }) {
  return (
    <If
      when={props.zones().length > 1}
      else={
        <View class="pl-1 justify-center" style={{ height: DAY_HEADER_HEIGHT }}>
          <AddTimeZoneButton />
        </View>
      }
    >
      <View class="flex-row" style={{ height: DAY_HEADER_HEIGHT }}>
        <Each of={props.zones()} key={(zone) => zone.tzid}>
          {(zone) => (
            <View
              testID="week-zone-label"
              class={cn("pr-1 items-end justify-center", !zone().local && "opacity-70")}
              style={{ width: GUTTER_WIDTH }}
              tooltip={
                <Tooltip label={zoneDescription(zone().tzid, activeDate())} placement="bottom" />
              }
            >
              <ZoneName
                tzid={zone().tzid}
                local={zone().local}
                name={zoneAbbreviation(zone().tzid, activeDate())}
              />
            </View>
          )}
        </Each>
      </View>
    </If>
  )
}

/** `inset` keeps it inside its column instead of overhanging the neighbours. */
function CurrentTimeIndicator(props: { inset: boolean }) {
  const clock = () => {
    now()
    return Temporal.Now.zonedDateTimeISO(getViewerTzid())
  }
  const label = () => {
    const { hour, minute } = clock()
    const twelve = timeFormat() === "12h"
    const shown = twelve ? hour % 12 || 12 : hour
    return [shown, minute.toString().padStart(2, "0"), twelve ? (hour < 12 ? "am" : "pm") : ""]
  }
  const top = () => {
    const { hour, minute } = clock()
    return ((hour * 60 + minute) / DAY_MINUTES) * GRID_HEIGHT
  }
  return (
    <View
      class={cn(
        "absolute z-10 flex-row items-center h-3",
        props.inset ? "left-0 right-0 pl-1" : "-left-3.5 -right-1",
      )}
      style={{ top: top() - 6, pointerEvents: "none" }}
    >
      <View class="flex-row shrink-0">
        <Text class={cn(typography.micro(), "font-medium leading-none text-today")}>
          {label()[0]}
        </Text>
        <Text class={cn(typography.micro(), "font-medium leading-none text-today animate-pulse")}>
          :
        </Text>
        <Text class={cn(typography.micro(), "font-medium leading-none text-today")}>
          {label()[1]}
          {label()[2]}
        </Text>
      </View>
      <View class="ml-1 flex-1 border-t border-dashed border-today" />
    </View>
  )
}

function DayColumn(props: {
  index: () => number
  left: () => number
  dayWidth: () => number
  span: Span
}) {
  const date = computed(() => dateOf(props.index()))
  const blocks = (): TimedBlock<TimedItem>[] => weekEvents().blocks.get(epochDay(date())) ?? []
  // A timed selection can run across days: each column draws its own part.
  const selection = () => {
    const current = createSelection()
    return current?.kind === "timed" ? selectionPartOn(current, date()) : null
  }

  return (
    <View
      role="button"
      testID="week-day"
      onPress={(press) => {
        if (press.clickCount === 2) createEventAt(press.pagePosition)
        else navigateToDate(date())
      }}
      class={cn("absolute top-0 border-r border-border", FOCUS_RING, dayClass(date(), props.span))}
      style={{
        left: props.left(),
        width: props.dayWidth(),
        height: GRID_HEIGHT,
      }}
    >
      <Each of={HOURS}>
        {(hour) => (
          <View
            class="absolute left-0 right-0 h-px bg-border"
            style={{ top: hour() * HOUR_HEIGHT - 1 }}
          />
        )}
      </Each>
      <Each
        of={blocks()}
        key={(block) => `${block.item.event.calendar_slug}/${block.item.event.id}`}
      >
        {(block) => <TimedEventBlock block={block} dayWidth={props.dayWidth} />}
      </Each>
      <If when={selection()}>
        {(range) => (
          <View
            class="absolute left-0 z-10 rounded-(--radius-sm)"
            style={{
              ...verticalBox(
                (range().startMinutes / DAY_MINUTES) * 100,
                ((range().endMinutes - range().startMinutes) / DAY_MINUTES) * 100,
              ),
              width: selectionWidth(props.dayWidth()),
              backgroundColor: selectionColor(),
              pointerEvents: "none",
            }}
          />
        )}
      </If>
      <If when={date().equals(currentDay())}>
        <CurrentTimeIndicator inset={props.span === "day"} />
      </If>
    </View>
  )
}

function DayHeader(props: {
  index: () => number
  left: () => number
  dayWidth: () => number
  lanes: () => boolean
  span: Span
}) {
  const date = computed(() => dateOf(props.index()))
  const isToday = () => date().equals(currentDay())
  return (
    <View
      role="button"
      onPress={(press) => {
        if (press.clickCount === 2) createEventAt(press.pagePosition)
        else navigateToDate(date())
      }}
      class={cn(
        "absolute top-0 bottom-0 border-r border-border",
        FOCUS_RING,
        dayClass(date(), props.span),
      )}
      style={{ left: props.left(), width: props.dayWidth() }}
    >
      <View
        // A lone day reads from the left, like its events; a week's dates line up on the right.
        class={cn(
          "flex-row items-baseline gap-1 p-0.5 pb-px",
          props.span === "day" ? "justify-start pl-2" : "justify-end",
        )}
        style={{ height: DAY_HEADER_HEIGHT }}
      >
        <Text class={cn(typography.numericalSm(), "text-muted-foreground")}>
          {formatWeekday(date(), "short")}
        </Text>
        <View
          class={cn(
            "size-7 items-center justify-center rounded-(--radius-circle)",
            isToday() && "bg-today",
          )}
        >
          <Text
            class={cn(typography.numerical(), "font-medium", isToday() && "text-today-foreground")}
          >
            {date().day}
          </Text>
        </View>
      </View>
      <If when={props.lanes()}>
        <View class="flex-1 border-t border-border" />
      </If>
    </View>
  )
}

export function WeekView() {
  return timeGridView("week")
}

/** The week view's strip, one day wide: the same view at another width. */
export function DayView() {
  return timeGridView("day")
}

function timeGridView(span: Span): JSX.Element {
  const width = signal(0)
  const height = signal(0)
  // The gutter's zones from left to right: the extra ones, then the viewer's own beside the days.
  const zones = computed((): GutterZone[] => [
    ...extraTimeZones().map((tzid) => ({ tzid, local: false })),
    { tzid: viewerTzid(), local: true },
  ])
  const gutterWidth = () => zones().length * GUTTER_WIDTH
  const dayWidth = () => Math.max(DAY_WIDTH_MIN, (width() - gutterWidth()) / VISIBLE_DAYS[span])
  const showDays = holdVisibleDays(LOAD_BUFFER_DAYS, LOAD_EDGE_DAYS)

  const openedAt = untracked(() => firstVisibleIndex(activeDate(), span))
  // Days are laid out around this one, and the strip is shifted to the day shown. A day
  // view keeps it at that day: NSH drops views laid out over three viewports from their
  // scroll view's, wherever a transform shows them.
  const base = signal(openedAt)
  const stripX = createAnimatedValue(0)
  const track = trackWindow(() => TRACK_DAYS, OVERSCAN_DAYS)

  // Where scrolling is, known from its events; a drag asks between them.
  let offsetX = 0
  let offsetY = 0
  let page = { x: 0, y: 0 }
  let root: ViewRef | undefined
  let days: ScrollRef | undefined
  let hours: ScrollRef | undefined
  let opened = false

  const laneStart = computed(() => Math.floor(track.first() / 7) * 7)
  const allDay = computed(() =>
    layoutAllDay(weekEvents().spanning, dateOf(laneStart()), LANE_RANGE_DAYS),
  )
  const hasAllDay = () => allDay().bars.length > 0
  const lanesHeight = () =>
    hasAllDay() ? allDay().laneCount * LANE_HEIGHT + LANES_TOP + LANES_BOTTOM : 0
  const headerHeight = () => DAY_HEADER_HEIGHT + lanesHeight()
  const leftOf = (index: number) => (index - base()) * dayWidth()
  const stripShift = () => stripX.mul(-1).add(base() * dayWidth())

  const viewportWidth = () => untracked(width) - untracked(gutterWidth)

  // A bar that starts left of the viewport keeps its title at the viewport's edge,
  // following the strip on the UI thread, until the bar's end leaves no room for it.
  const titleShift = (index: number, span: number) => {
    const start = index * dayWidth()
    const room = Math.max(1, span * dayWidth() - BAR_TITLE_ROOM)
    return stripX.interpolate({
      inputRange: [start, start + room],
      outputRange: [0, room],
      extrapolate: "clamp",
    })
  }
  const viewportHeight = () => untracked(height) - untracked(headerHeight)

  const columns = (left: (index: number) => number) => (
    <Each of={track.slots()}>
      {(slot) => (
        <DayColumn
          index={() => track.indexOf(slot())}
          left={() => left(track.indexOf(slot()))}
          dayWidth={dayWidth}
          span={span}
        />
      )}
    </Each>
  )

  const reportVisible = () => {
    const w = untracked(dayWidth)
    const first = Math.floor(offsetX / w)
    const last = Math.ceil((offsetX + viewportWidth()) / w)
    const origin = epochDay(untracked(trackOrigin))
    showDays(origin + first, origin + last)
    track.show(offsetX, viewportWidth(), w)
  }

  // The days a day view's strip may be showing, between the ends of its running slides.
  let sliding = { from: openedAt, to: openedAt }
  let slides = 0

  const scrollToDay = (index: number, animated: boolean) => {
    const x = index * untracked(dayWidth)
    if (span === "week") {
      days?.scrollTo({ x, animated })
      return
    }
    offsetX = x
    reportVisible()
    base.set(index)
    const from = Math.min(sliding.from, index)
    const to = Math.max(sliding.to, index)
    const slide = ++slides
    if (animated && to - from <= SLIDE_REACH_DAYS) {
      sliding = { from, to }
      void stripX.timing(x, { duration: DAY_SLIDE_MS }).then(() => {
        if (slide === slides) sliding = { from: index, to: index }
      })
    } else {
      sliding = { from: index, to: index }
      stripX.set(x)
    }
  }

  // A column fully on screen stays where it is; anything else brings its week (or,
  // in a day view, itself) to the left edge, without animating past more than a few screens.
  const reveal = (date: Temporal.PlainDate) => {
    if (!opened) return
    const index = epochDay(date) - epochDay(untracked(trackOrigin))
    if (index < 0 || index >= TRACK_DAYS) {
      centerTrack(date)
      queueMicrotask(() => scrollToDay(firstVisibleIndex(date, span), false))
      return
    }
    const w = untracked(dayWidth)
    const left = index * w
    if (left >= offsetX - 1 && left + w <= offsetX + viewportWidth() + 1) return
    const target = firstVisibleIndex(date, span)
    scrollToDay(target, Math.abs(target * w - offsetX) <= 3 * viewportWidth())
  }

  // Deliberate jumps, even to the date already selected, and changes from
  // elsewhere, like the agenda's scrolling.
  cleanup(onNavigate(reveal))
  effect(() => {
    const date = activeDate()
    untracked(() => reveal(date))
  })

  // Wider columns at the same offset would show other days: keep the left one.
  // Until the strip opens, `openStrip` places it; scrolling here first would
  // flash the track's first day.
  let keptWidth = 0
  effect(() => {
    const next = dayWidth()
    if (opened && keptWidth !== next) {
      const index = Math.round(offsetX / keptWidth)
      offsetX = index * next
      queueMicrotask(() => scrollToDay(index, false))
      untracked(reportVisible)
    }
    keptWidth = next
  })

  // Owned by the span: switching between day and week mounts one before the other's cleanup.
  setDayAreas(span, () => {
    const w = untracked(dayWidth)
    const left = page.x + untracked(gutterWidth)
    const body = page.y + untracked(headerHeight)
    const right = page.x + untracked(width)
    const bottom = page.y + untracked(height)
    const areas: DayArea[] = []
    const last = Math.ceil((offsetX + viewportWidth()) / w)
    for (let index = Math.floor(offsetX / w); index <= last; index++) {
      const day = untracked(() => dateOf(index))
      const x = left + index * w - offsetX
      const from = Math.max(left, x)
      const visibleWidth = Math.min(right, x + w) - from
      if (visibleWidth <= 0) continue
      areas.push({
        day,
        zone: "timed",
        rect: { x, y: body - offsetY, width: w, height: GRID_HEIGHT },
        visible: { x: from, y: body, width: visibleWidth, height: bottom - body },
      })
      areas.push({
        day,
        zone: "all-day",
        rect: { x, y: page.y, width: w, height: body - page.y },
        visible: { x: from, y: page.y, width: visibleWidth, height: body - page.y },
      })
    }
    return areas
  })
  cleanup(() => setDayAreas(span, null))

  const forgetScroller = setDragScroller({
    rect: () => ({ ...page, width: untracked(width), height: untracked(height) }),
    // A day never rests between two days: only navigation moves it sideways.
    axes: { x: span === "week", y: true },
    scrollBy(dx, dy) {
      if (dx) {
        const end = TRACK_DAYS * untracked(dayWidth) - viewportWidth()
        offsetX = Math.max(0, Math.min(end, offsetX + dx))
        days?.scrollTo({ x: offsetX, animated: false })
      }
      if (dy) {
        offsetY = Math.max(0, Math.min(GRID_HEIGHT - viewportHeight(), offsetY + dy))
        hours?.scrollTo({ y: offsetY, animated: false })
      }
    },
  })
  cleanup(forgetScroller)

  // Nested in the vertical scroll view, it has no size yet when it's made, which
  // `contentOffset` would be clamped to.
  const openStrip = () => {
    if (opened) return
    opened = true
    offsetX = openedAt * untracked(dayWidth)
    scrollToDay(openedAt, false)
    reportVisible()
  }

  // The current hour on opening a week holding today, the morning otherwise.
  const startHour = untracked(() => {
    const opened = plainDateFromEpochDay(epochDay(trackOrigin()) + openedAt)
    const showsToday =
      epochDay(currentDay()) >= epochDay(opened) &&
      epochDay(currentDay()) < epochDay(opened) + VISIBLE_DAYS[span]
    const clock = Temporal.Now.zonedDateTimeISO(getViewerTzid())
    return showsToday ? clock.hour + clock.minute / 60 : 8
  })
  offsetY = Math.max(0, startHour * HOUR_HEIGHT - 16)

  return (
    <View
      ref={root}
      class="flex-1 min-h-0 min-w-0"
      {...createDragHandlers()}
      onContextMenu={openDayMenu}
      onLayout={({ bounds }) => {
        width.set(bounds.size.width)
        height.set(bounds.size.height)
        void root?.measure().then((measured) => {
          if (measured) page = measured.pagePosition
        })
      }}
    >
      <If when={width() > 0}>
        <View class="flex-row shrink-0 bg-background" style={{ height: headerHeight() }}>
          <View
            class="border-r border-b border-border bg-background shrink-0"
            style={{ width: gutterWidth() }}
          >
            <GutterHeader zones={zones} />
          </View>
          <View class="flex-1 min-w-0 overflow-hidden relative border-b border-border">
            <View
              class="absolute top-0 bottom-0 left-0 w-0"
              style={{ translate: [stripShift(), 0] }}
            >
              <Each of={track.slots()}>
                {(slot) => (
                  <DayHeader
                    index={() => track.indexOf(slot())}
                    left={() => leftOf(track.indexOf(slot()))}
                    dayWidth={dayWidth}
                    lanes={hasAllDay}
                    span={span}
                  />
                )}
              </Each>
              <If when={hasAllDay()}>
                <View
                  class="absolute left-0"
                  style={{ top: DAY_HEADER_HEIGHT + LANES_TOP, pointerEvents: "box-none" }}
                >
                  <Each
                    of={allDay().bars}
                    key={(bar) => `${bar.item.event.calendar_slug}/${bar.item.event.id}`}
                  >
                    {(bar) => (
                      <AllDayBarBlock
                        bar={bar as () => AllDayBar<Spanning>}
                        left={() => leftOf(laneStart() + bar().column)}
                        width={() => bar().span * dayWidth()}
                        titleShift={() => titleShift(laneStart() + bar().column, bar().span)}
                      />
                    )}
                  </Each>
                </View>
              </If>
            </View>
          </View>
        </View>
        <Scroll
          ref={hours}
          class="flex-1 min-h-0"
          contentOffset={{ y: offsetY }}
          onScroll={(event) => {
            offsetY = event.offset.y
          }}
        >
          <View class="flex-row" style={{ height: GRID_HEIGHT }}>
            <TimeGutter zones={zones} />
            {span === "week" ? (
              <Scroll
                ref={days}
                horizontal
                scrollValue={stripX}
                scrollbar={false}
                bounces={false}
                onScroll={(event) => {
                  offsetX = event.offset.x
                  reportVisible()
                }}
                onLayout={openStrip}
                class="flex-1"
              >
                <View style={{ width: TRACK_DAYS * dayWidth(), height: GRID_HEIGHT }}>
                  {columns((index) => index * dayWidth())}
                </View>
              </Scroll>
            ) : (
              // A day has no scroll view to swipe: `scrollable={false}` still let a
              // touchpad move one on Linux. `scrollToDay` moves the strip, as the header.
              <View class="flex-1 overflow-hidden" onLayout={openStrip}>
                <View
                  class="absolute top-0 left-0 w-0"
                  style={{ height: GRID_HEIGHT, translate: [stripShift(), 0] }}
                >
                  {columns(leftOf)}
                </View>
              </View>
            )}
          </View>
        </Scroll>
      </If>
    </View>
  )
}
