import { Temporal } from "@js-temporal/polyfill"
import { computed, Text, View } from "nsh"

import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { epochDay, formatMonth, isoWeekNumber } from "@/lib/event-time"
import { type AllDayBar, type DayRange, layoutAllDay } from "@/lib/layout"
import { cn, FOCUS_RING } from "@/lib/utils"

import { activeDate, navigateToDate } from "@/stores/calendar"
import { currentDay } from "@/stores/clock"
import { createEventAt, createSelection } from "@/stores/drag"
import { firstDayOfWeek, showWeekNumbers } from "@/stores/settings"
import { displayCase } from "@/themes"

import { AllDayBarView, HiddenEvents, SelectionBar, TimedEvent } from "./EventBlocks"
import {
  EMPTY_WEEK,
  LANE_GAP,
  LANE_HEIGHT,
  MAX_ALL_DAY_LANES,
  MAX_TIMED_VISIBLE,
  type Spanning,
  trackOrigin,
  weekLayouts,
} from "./layout"

// The day number's height: bars start right below it.
const DAY_HEADER_HEIGHT = 28
const BAR_INSET = 4
const COLUMNS = [0, 1, 2, 3, 4, 5, 6]

const isEventBar = (bar: AllDayBar<Spanning | DayRange>): bar is AllDayBar<Spanning> =>
  "event" in bar.item

function Day(props: {
  date: () => Temporal.PlainDate
  timed: () => CalendarEvent[]
  hiddenAllDay: () => CalendarEvent[]
  reservedLanes: () => number
}) {
  const selected = () => props.date().equals(activeDate())
  const isToday = () => props.date().equals(currentDay())
  const weekend = () => props.date().dayOfWeek >= 6
  const visible = () => props.timed().slice(0, MAX_TIMED_VISIBLE)
  const hidden = () => [...props.hiddenAllDay(), ...props.timed().slice(MAX_TIMED_VISIBLE)]

  return (
    <View
      role="button"
      testID="day"
      onPress={(press) => {
        if (press.clickCount === 2) createEventAt(press.pagePosition)
        else navigateToDate(props.date())
      }}
      class={cn(
        "flex-1 min-w-0 border-r border-border overflow-hidden",
        FOCUS_RING,
        weekend() && "bg-weekend",
        selected() && "bg-selected text-selected-foreground",
      )}
    >
      <View class="flex-row items-center justify-end gap-1 p-1">
        <If when={props.date().day === 1 || selected()}>
          <Text class={cn("font-mono text-xs text-muted-foreground", displayCase())}>
            {formatMonth(props.date(), "long")}
          </Text>
        </If>
        <View
          class={cn(
            "size-5 items-center justify-center rounded-(--radius-circle)",
            isToday() && "bg-today",
            selected() && !isToday() && "bg-selected",
          )}
        >
          <Text class={cn("font-mono text-xs", isToday() && "text-today-foreground")}>
            {props.date().day}
          </Text>
        </View>
      </View>
      <View
        class="gap-1 px-(--month-padding-inline) pb-1"
        style={{
          paddingTop:
            props.reservedLanes() > 0 ? props.reservedLanes() * LANE_HEIGHT - LANE_GAP + 4 : 0,
        }}
      >
        <Each of={visible()} key={eventKey}>
          {(event) => <TimedEvent event={event} />}
        </Each>
        <If when={hidden().length > 0}>
          <HiddenEvents events={hidden} />
        </If>
      </View>
    </View>
  )
}

/** Where a month starts in this row: a line above it, or a mark between its days. */
function MonthBoundary(props: { column: () => number; width: () => number }) {
  return (
    <If when={props.column() >= 0}>
      <View
        class="absolute bg-foreground/28"
        style={
          props.column() === 0
            ? { left: 0, right: 0, top: -1, height: 3, pointerEvents: "none" }
            : {
                top: 0,
                bottom: 0,
                width: 2,
                left: (props.column() / 7) * props.width() - 1,
                pointerEvents: "none",
              }
        }
      />
    </If>
  )
}

export function WeekRow(props: { index: () => number; height: () => number; width: () => number }) {
  const days = computed(() => {
    const start = trackOrigin().add({ weeks: props.index() })
    return COLUMNS.map((column) => start.add({ days: column }))
  })
  const layout = () => weekLayouts().get(props.index()) ?? EMPTY_WEEK

  // The range being drawn is packed where the draft event will be on release.
  const selectionHere = () => {
    const selection = createSelection()
    if (selection?.kind !== "days") return null
    const [first, last] = [days()[0]!, days()[6]!]
    return epochDay(selection.firstDay) <= epochDay(last) &&
      epochDay(selection.lastDay) >= epochDay(first)
      ? selection
      : null
  }
  const bars = computed<AllDayBar<Spanning | DayRange>[]>(() => {
    const selection = selectionHere()
    if (!selection) return layout().bars
    return layoutAllDay<Spanning | DayRange>([...layout().spanning, selection], days()[0]!, 7).bars
  })
  const shown = () => bars().filter((bar) => bar.lane < MAX_ALL_DAY_LANES)
  const eventBars = () => shown().filter(isEventBar)
  const selectionBar = () => shown().find((bar) => !isEventBar(bar))
  const covers = (bar: AllDayBar<unknown>, column: number) =>
    bar.column <= column && column < bar.column + bar.span

  const reservedAt = (column: number) =>
    shown()
      .filter((bar) => covers(bar, column))
      .reduce((lanes, bar) => Math.max(lanes, bar.lane + 1), 0)
  const hiddenAt = (column: number) =>
    bars()
      .filter((bar) => bar.lane >= MAX_ALL_DAY_LANES && covers(bar, column))
      .filter(isEventBar)
      .sort((a, b) => a.lane - b.lane)
      .map((bar) => bar.item.event)
  const monthStart = () => days().findIndex((day) => day.day === 1)

  return (
    <View
      class="absolute left-0 right-0 border-b border-border flex-row"
      style={{ top: props.index() * props.height(), height: props.height() }}
    >
      <Each of={COLUMNS}>
        {(column) => (
          <Day
            date={() => days()[column()]!}
            timed={() => layout().timedByCol[column()] ?? []}
            hiddenAllDay={() => hiddenAt(column())}
            reservedLanes={() => reservedAt(column())}
          />
        )}
      </Each>
      <View
        class="absolute left-0 right-0"
        style={{ top: DAY_HEADER_HEIGHT, pointerEvents: "box-none" }}
      >
        <Each of={eventBars()} key={(bar) => eventKey(bar.item.event)}>
          {(bar) => <AllDayBarView bar={bar} width={props.width} inset={BAR_INSET} />}
        </Each>
        <If when={selectionBar()}>
          {(bar) => <SelectionBar bar={bar} width={props.width} inset={BAR_INSET} />}
        </If>
      </View>
      <MonthBoundary column={monthStart} width={props.width} />
      <If when={showWeekNumbers()}>
        <Text
          class="absolute left-1 top-1 font-mono text-2xs text-muted-foreground"
          style={{ pointerEvents: "none" }}
        >
          {isoWeekNumber(days()[0]!, firstDayOfWeek())}
        </Text>
      </If>
    </View>
  )
}
