import { Temporal } from "@js-temporal/polyfill"
import {
  cleanup,
  effect,
  reduceMotion,
  Scroll,
  type ScrollRef,
  signal,
  Text,
  untracked,
  View,
  type ViewRef,
} from "nsh"

import { type DayArea, setDayAreas } from "@/lib/day-hits"
import { epochDay, plainDateFromEpochDay } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { activeDate, onNavigate } from "@/stores/calendar"
import { createDragHandlers, setDragScroller } from "@/stores/drag"
import { firstDayOfWeek } from "@/stores/settings"
import { displayCase } from "@/themes"
import { openDayMenu } from "@/views/event-block"
import { trackWindow } from "@/views/track-window"
import { holdVisibleDays } from "@/views/visible-range"

import { WeekRow } from "./WeekRow"
import { centerTrack, TRACK_WEEKS, trackIndex, trackOrigin } from "./layout"
import { createWheelSnap } from "./wheel-snap"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
/** Days loaded beyond the viewport, and how close to the end of them it grows. */
const BUFFER_DAYS = 63
const EDGE_DAYS = 28

/** A fling carries as far as WebKitGTK's kinetic scrolling did, a quarter of a second's worth. */
const WEEK_SNAP_DECELERATION = 0.996
/** Rows kept beyond the viewport on each side. */
const OVERSCAN_ROWS = 2

function WeekDayLabels() {
  const labels = () => {
    const list = [...WEEKDAYS]
    if (firstDayOfWeek() === "sunday") list.unshift(list.pop()!)
    return list
  }
  return (
    <View class="flex-row border-b border-border">
      <Each of={labels()}>
        {(label) => (
          <View
            class={cn(
              "flex-1 items-center py-2",
              (label() === "Sat" || label() === "Sun") && "bg-weekend",
            )}
          >
            <Text class={cn("font-mono text-2xs text-muted-foreground font-medium", displayCase())}>
              {label()}
            </Text>
          </View>
        )}
      </Each>
    </View>
  )
}

/** The week holding the 1st of `date`'s month: what the top row shows on opening. */
const anchorIndex = (date: Temporal.PlainDate) => trackIndex(date.with({ day: 1 }))

export function MonthView() {
  const width = signal(0)
  const height = signal(0)
  const rowHeight = () => Math.max(80, Math.round(width() / 7))
  const showDays = holdVisibleDays(BUFFER_DAYS, EDGE_DAYS)

  // Where scrolling is, known from its events; a drag asks between them.
  let offset = 0
  let page = { x: 0, y: 0 }
  let scroller: ScrollRef | undefined
  let grid: ViewRef | undefined
  // The week at the top, from where scrolling rests: rows snap, so it's exact.
  let topIndex = anchorIndex(untracked(activeDate))

  const track = trackWindow(() => TRACK_WEEKS, OVERSCAN_ROWS)

  const moveTo = (index: number, animated: boolean) => {
    topIndex = index
    scroller?.scrollTo({ y: index * untracked(rowHeight), animated })
  }

  const reportVisible = () => {
    const h = untracked(rowHeight)
    const origin = epochDay(untracked(trackOrigin))
    const first = Math.floor(offset / h)
    const last = Math.ceil((offset + untracked(height)) / h)
    showDays(origin + first * 7, origin + last * 7 + 6)
    track.show(offset, untracked(height), h)
  }

  // A day whose week is fully on screen stays where it is: that's what a scroll
  // that reached it would have left.
  cleanup(
    onNavigate((date) => {
      if (trackIndex(date) < 0 || trackIndex(date) >= TRACK_WEEKS) centerTrack(date)
      const index = trackIndex(date)
      const h = untracked(rowHeight)
      const top = index * h
      if (top >= offset - 1 && top + h <= offset + untracked(height) + 1) return
      moveTo(index, true)
    }),
  )

  const rest = (next: number) => {
    const index = next / untracked(rowHeight)
    // Off the grid means a rescale is on its way; the re-anchor below settles it.
    if (Math.abs(index - Math.round(index)) < 0.01) topIndex = Math.round(index)
  }

  // Taller rows at the same offset would show another week: keep the top one.
  let keptHeight = 0
  effect(() => {
    const next = rowHeight()
    if (keptHeight !== 0 && keptHeight !== next) {
      offset = topIndex * next
      queueMicrotask(() => moveTo(topIndex, false))
      untracked(reportVisible)
    }
    keptHeight = next
  })

  setDayAreas("month", () => {
    const h = untracked(rowHeight)
    const day = untracked(width) / 7
    const origin = epochDay(untracked(trackOrigin))
    const visible = { x: page.x, y: page.y, width: untracked(width), height: untracked(height) }
    const areas: DayArea[] = []
    const last = Math.ceil((offset + visible.height) / h)
    for (let row = Math.floor(offset / h); row <= last; row++) {
      for (let column = 0; column < 7; column++) {
        areas.push({
          day: plainDateFromEpochDay(origin + row * 7 + column),
          zone: "day",
          rect: {
            x: page.x + column * day,
            y: page.y + row * h - offset,
            width: day,
            height: h,
          },
          visible,
        })
      }
    }
    return areas
  })
  cleanup(() => setDayAreas("month", null))

  const forgetScroller = setDragScroller({
    rect: () => ({ ...page, width: untracked(width), height: untracked(height) }),
    axes: { x: false, y: true },
    scrollBy(_, dy) {
      offset = Math.max(0, offset + dy)
      scroller?.scrollTo({ y: offset, animated: false })
    },
    // Auto-scroll stops anywhere: rows only snap after a user's scroll.
    settle: () => moveTo(Math.round(offset / untracked(rowHeight)), true),
  })
  cleanup(forgetScroller)

  // Where a wheel scrolls to, and that it lands on a week.
  const wheel = createWheelSnap({
    offset: () => offset,
    rowHeight: () => untracked(rowHeight),
    maxOffset: () => TRACK_WEEKS * untracked(rowHeight) - untracked(height),
    scrollTo(y, animated) {
      offset = y
      scroller?.scrollTo({ y, animated })
      if (!animated) reportVisible()
    },
    now: () => performance.now(),
    setTimer(run, ms) {
      const timer = setTimeout(run, ms)
      return () => clearTimeout(timer)
    },
    reduceMotion: () => untracked(reduceMotion),
  })
  cleanup(wheel.dispose)

  return (
    <View class="flex-1 min-h-0">
      <WeekDayLabels />
      <View
        ref={grid}
        class="flex-1 min-h-0"
        {...createDragHandlers()}
        onContextMenu={openDayMenu}
        onLayout={({ bounds }) => {
          width.set(bounds.size.width)
          height.set(bounds.size.height)
          void grid?.measure().then((measured) => {
            if (measured) page = measured.pagePosition
          })
        }}
      >
        <If when={width() > 0}>
          <Scroll
            ref={scroller}
            snapToInterval={reduceMotion() ? 0 : rowHeight()}
            decelerationRate={WEEK_SNAP_DECELERATION}
            contentOffset={{ y: untracked(() => topIndex * rowHeight()) }}
            onScroll={(event) => {
              offset = event.offset.y
              reportVisible()
            }}
            onScrollEnd={(event) => rest(event.offset.y)}
            onLayout={() => {
              offset = topIndex * untracked(rowHeight)
              reportVisible()
            }}
            class="flex-1"
          >
            <View
              style={{ height: TRACK_WEEKS * rowHeight() }}
              onWheel={(event) => wheel.wheel(event)}
            >
              <Each of={track.slots()}>
                {(slot) => (
                  <WeekRow index={() => track.indexOf(slot())} height={rowHeight} width={width} />
                )}
              </Each>
            </View>
          </Scroll>
        </If>
      </View>
    </View>
  )
}
