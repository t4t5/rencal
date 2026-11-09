import { Temporal } from "@js-temporal/polyfill"
import {
  cleanup,
  computed,
  createAnimatedValue,
  effect,
  Scroll,
  type ScrollRef,
  signal,
  Text,
  untracked,
  View,
  type ViewRef,
} from "nsh"

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
import { currentDay, now } from "@/stores/clock"
import {
  createDragHandlers,
  createEventAt,
  createSelection,
  selectionColor,
  setDragScroller,
} from "@/stores/drag"
import { timeFormat } from "@/stores/settings"
import { displayCase } from "@/themes"
import { openDayMenu } from "@/views/event-block"
import type { Spanning } from "@/views/month/layout"
import { trackWindow } from "@/views/track-window"
import { holdVisibleDays } from "@/views/visible-range"

import { AllDayBarBlock, LANE_HEIGHT, TimedEventBlock } from "./EventBlocks"
import { GRID_HEIGHT, GUTTER_WIDTH, HOUR_HEIGHT, selectionWidth, verticalBox } from "./grid"
import {
  centerTrack,
  TRACK_DAYS,
  trackOrigin,
  type TimedItem,
  weekEvents,
  weekIndex,
} from "./layout"

/** Day column width: seven days fill the viewport right of the gutter, never under this. */
const DAY_WIDTH_MIN = 100
const DAY_HEADER_HEIGHT = 31
/** Days kept beyond the viewport on each side. */
const OVERSCAN_DAYS = 3
/** All-day bars are packed over a stretch of this many days, so lanes hold still in a scroll. */
const LANE_RANGE_DAYS = 28
/** Days of events loaded beyond the viewport, and how close to their end they grow. */
const LOAD_BUFFER_DAYS = 42
const LOAD_EDGE_DAYS = 14
/** Lanes are padded by these to match the gap between them. */
const LANES_TOP = 1
const LANES_BOTTOM = 2

const HOURS = Array.from({ length: 23 }, (_, i) => i + 1)

const dateOf = (index: number) => plainDateFromEpochDay(epochDay(trackOrigin()) + index)

function dayClass(date: Temporal.PlainDate) {
  if (date.equals(activeDate())) return "bg-selected text-selected-foreground"
  return date.dayOfWeek >= 6 ? "bg-weekend" : undefined
}

function TimeGutter() {
  return (
    <View
      class="relative border-r border-border bg-background shrink-0"
      style={{ width: GUTTER_WIDTH, height: GRID_HEIGHT }}
    >
      <Each of={HOURS}>
        {(hour) => (
          <Text
            class="absolute right-1.5 font-mono text-2xs leading-none text-muted-foreground"
            style={{ top: hour() * HOUR_HEIGHT - 6 }}
          >
            {formatWallclockTime(hour(), 0, timeFormat())}
          </Text>
        )}
      </Each>
    </View>
  )
}

function CurrentTimeIndicator() {
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
      class="absolute -left-3.5 -right-1 z-10 flex-row items-center h-3"
      style={{ top: top() - 6, pointerEvents: "none" }}
    >
      <View class="flex-row shrink-0">
        <Text class="text-2xs font-medium leading-none text-today">{label()[0]}</Text>
        <Text class="text-2xs font-medium leading-none text-today animate-pulse">:</Text>
        <Text class="text-2xs font-medium leading-none text-today">
          {label()[1]}
          {label()[2]}
        </Text>
      </View>
      <View class="ml-1 flex-1 border-t border-dashed border-today" />
    </View>
  )
}

function DayColumn(props: { index: () => number; dayWidth: () => number }) {
  const date = computed(() => dateOf(props.index()))
  const blocks = (): TimedBlock<TimedItem>[] => weekEvents().blocks.get(epochDay(date())) ?? []
  const selection = () => {
    const current = createSelection()
    return current?.kind === "timed" && current.day.equals(date()) ? current : null
  }

  return (
    <View
      role="button"
      testID="week-day"
      onPress={(press) => {
        if (press.clickCount === 2) createEventAt(press.pagePosition)
        else navigateToDate(date())
      }}
      class={cn("absolute top-0 border-r border-border", FOCUS_RING, dayClass(date()))}
      style={{
        left: props.index() * props.dayWidth(),
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
        <CurrentTimeIndicator />
      </If>
    </View>
  )
}

function DayHeader(props: {
  index: () => number
  left: () => number
  dayWidth: () => number
  lanes: () => boolean
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
      class={cn("absolute top-0 bottom-0 border-r border-border", FOCUS_RING, dayClass(date()))}
      style={{ left: props.left(), width: props.dayWidth() }}
    >
      <View
        class="flex-row items-baseline justify-end gap-1 p-0.5 pb-px"
        style={{ height: DAY_HEADER_HEIGHT }}
      >
        <Text class={cn("font-mono text-2xs text-muted-foreground", displayCase())}>
          {formatWeekday(date(), "short")}
        </Text>
        <View
          class={cn(
            "size-7 items-center justify-center rounded-(--radius-circle)",
            isToday() && "bg-today",
          )}
        >
          <Text class={cn("font-mono text-xs font-medium", isToday() && "text-today-foreground")}>
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
  const width = signal(0)
  const height = signal(0)
  const dayWidth = () => Math.max(DAY_WIDTH_MIN, (width() - GUTTER_WIDTH) / 7)
  const showDays = holdVisibleDays(LOAD_BUFFER_DAYS, LOAD_EDGE_DAYS)

  const openedAt = untracked(() => weekIndex(activeDate()))
  // The header's days sit relative to this one, and it follows the strip on the UI thread.
  const base = openedAt
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
  const leftOf = (index: number) => (index - base) * dayWidth()

  const viewportWidth = () => untracked(width) - GUTTER_WIDTH
  const viewportHeight = () => untracked(height) - untracked(headerHeight)

  const reportVisible = () => {
    const w = untracked(dayWidth)
    const first = Math.floor(offsetX / w)
    const last = Math.ceil((offsetX + viewportWidth()) / w)
    const origin = epochDay(untracked(trackOrigin))
    showDays(origin + first, origin + last)
    track.show(offsetX, viewportWidth(), w)
  }

  const scrollToDay = (index: number, animated: boolean) =>
    days?.scrollTo({ x: index * untracked(dayWidth), animated })

  // A column fully on screen stays where it is; anything else brings its week
  // to the left edge, without animating past more than a few screens.
  const reveal = (date: Temporal.PlainDate) => {
    if (!opened) return
    const index = epochDay(date) - epochDay(untracked(trackOrigin))
    if (index < 0 || index >= TRACK_DAYS) {
      centerTrack(date)
      queueMicrotask(() => scrollToDay(weekIndex(date), false))
      return
    }
    const w = untracked(dayWidth)
    const left = index * w
    if (left >= offsetX - 1 && left + w <= offsetX + viewportWidth() + 1) return
    const target = weekIndex(date)
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
  let keptWidth = 0
  effect(() => {
    const next = dayWidth()
    if (keptWidth !== 0 && keptWidth !== next) {
      const index = Math.round(offsetX / keptWidth)
      offsetX = index * next
      queueMicrotask(() => scrollToDay(index, false))
      untracked(reportVisible)
    }
    keptWidth = next
  })

  setDayAreas("week", () => {
    const w = untracked(dayWidth)
    const left = page.x + GUTTER_WIDTH
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
  cleanup(() => setDayAreas("week", null))

  const forgetScroller = setDragScroller({
    rect: () => ({ ...page, width: untracked(width), height: untracked(height) }),
    axes: { x: true, y: true },
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
      epochDay(currentDay()) >= epochDay(opened) && epochDay(currentDay()) < epochDay(opened) + 7
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
            style={{ width: GUTTER_WIDTH }}
          />
          <View class="flex-1 min-w-0 overflow-hidden relative border-b border-border">
            <View
              class="absolute top-0 bottom-0 left-0 w-0"
              style={{ translate: [stripX.mul(-1).add(base * dayWidth()), 0] }}
            >
              <Each of={track.slots()}>
                {(slot) => (
                  <DayHeader
                    index={() => track.indexOf(slot())}
                    left={() => leftOf(track.indexOf(slot()))}
                    dayWidth={dayWidth}
                    lanes={hasAllDay}
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
            <TimeGutter />
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
                <Each of={track.slots()}>
                  {(slot) => <DayColumn index={() => track.indexOf(slot())} dayWidth={dayWidth} />}
                </Each>
              </View>
            </Scroll>
          </View>
        </Scroll>
      </If>
    </View>
  )
}
