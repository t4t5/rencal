import { Temporal } from "@js-temporal/polyfill"
import { cleanup, computed, Text, View, type ViewRef } from "nsh"

import { registerFlyTarget } from "@/components/sidebar/header/FlyAnimation"
import { Button } from "@/components/ui/button"

import { eventPaint } from "@/lib/event-paint"
import {
  epochDay,
  formatMonth,
  isoWeekNumber,
  occupiedDays,
  plainDateFromEpochDay,
  startOfWeek,
} from "@/lib/event-time"
import { inspectable } from "@/lib/inspect"
import { cn } from "@/lib/utils"

import { ChevronDownIcon, ChevronUpIcon } from "@/icons"
import { activeDate, calendars, navigateToDate } from "@/stores/calendar"
import { currentDay } from "@/stores/clock"
import { calendarEvents } from "@/stores/events"
import { firstDayOfWeek, showWeekNumbers } from "@/stores/settings"
import { displayCase, displayWeight } from "@/themes"

const WEEKS = 6
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
const ROWS = Array.from({ length: WEEKS }, (_, week) => week)
const COLUMNS = Array.from({ length: 7 }, (_, column) => column)

/** A dot per calendar on each day. */
const dotsByDay = computed(() => {
  const colors = new Map(calendars().map((c) => [c.slug, eventPaint(c.color ?? null).color]))
  const slugsByDay = new Map<number, Set<string>>()
  const dots = new Map<number, string[]>()
  for (const event of calendarEvents()) {
    const color = colors.get(event.calendar_slug)
    if (!color) continue
    for (const day of occupiedDays(event.dateInfo)) {
      const slugs = slugsByDay.get(day) ?? new Set()
      slugsByDay.set(day, slugs)
      if (slugs.has(event.calendar_slug)) continue
      slugs.add(event.calendar_slug)
      dots.set(day, [...(dots.get(day) ?? []), color])
    }
  }
  return dots
})

const monthStart = computed(() => activeDate().with({ day: 1 }), {
  equals: (a, b) => !!a && !!b && a.equals(b),
})
const gridStart = computed(() => epochDay(startOfWeek(monthStart(), firstDayOfWeek())))
const activeDay = computed(() => epochDay(activeDate()))
const today = computed(() => epochDay(currentDay()))

const dateAt = (day: number) => plainDateFromEpochDay(day)

const weekdayIndex = (column: number) => (firstDayOfWeek() === "sunday" ? (column + 6) % 7 : column)
const isWeekendColumn = (column: number) => weekdayIndex(column) >= 5

function Day(props: { day: () => number }) {
  let cell: ViewRef | undefined
  cleanup(registerFlyTarget({ day: props.day, ref: () => cell }))
  const date = () => dateAt(props.day())
  const selected = () => props.day() === activeDay()
  const isToday = () => props.day() === today()
  const outside = () => date().month !== monthStart().month
  const dots = () => dotsByDay().get(props.day()) ?? []
  return (
    <View
      ref={cell}
      role="button"
      onPress={() => navigateToDate(date())}
      class={cn(
        "size-[38px] items-center justify-center rounded-(--radius-circle)",
        selected() ? (isToday() ? "bg-today" : "bg-selected") : "hover:bg-accent",
      )}
    >
      <Text
        class={cn(
          "font-mono",
          selected() ? "text-lg font-bold" : "text-sm",
          outside() ? "text-muted-foreground" : "text-foreground",
          isToday() && (selected() ? "text-today-foreground" : "text-today"),
          !isToday() && selected() && "text-selected-foreground",
        )}
      >
        {date().day}
      </Text>
      <View class="absolute bottom-1 left-0 right-0 flex-row justify-center gap-[3px]">
        <Each of={dots()}>
          {(color) => (
            <View class="size-1 rounded-(--radius-circle)" style={{ backgroundColor: color() }} />
          )}
        </Each>
      </View>
    </View>
  )
}

function WeekNumberColumn(props: { firstDay: () => number }) {
  return (
    <If when={showWeekNumbers()}>
      <View class="w-8 items-center justify-center pt-[2px]">
        <Text class="text-2xs text-muted-foreground">
          {isoWeekNumber(dateAt(props.firstDay()), firstDayOfWeek())}
        </Text>
      </View>
    </If>
  )
}

function Week(props: { index: () => number }) {
  const firstDay = () => gridStart() + props.index() * 7
  const isSelected = () => activeDay() >= firstDay() && activeDay() < firstDay() + 7
  return (
    <View class={cn("flex-row", isSelected() && "bg-hover")}>
      <WeekNumberColumn firstDay={firstDay} />
      <Each of={COLUMNS}>
        {(column) => (
          <View class={cn("flex-1 items-center", isWeekendColumn(column()) && "bg-weekend")}>
            <Day day={() => firstDay() + column()} />
          </View>
        )}
      </Each>
    </View>
  )
}

function Weekdays() {
  const isCurrent = (column: number) => weekdayIndex(column) === currentDay().dayOfWeek - 1
  return (
    <View class="flex-row">
      <If when={showWeekNumbers()}>
        <View class="w-8" />
      </If>
      <Each of={COLUMNS}>
        {(column) => (
          <View class={cn("flex-1 items-center", isWeekendColumn(column()) && "bg-weekend")}>
            <Text
              class={cn("text-2xs", isCurrent(column()) ? "text-today" : "text-muted-foreground")}
            >
              {WEEKDAYS[weekdayIndex(column())]}
            </Text>
          </View>
        )}
      </Each>
    </View>
  )
}

const shiftMonth = (months: number) => navigateToDate(activeDate().add({ months }))

export function Minical() {
  return (
    <View ref={inspectable("Minical", "components/sidebar/Minical.tsx")} class="pt-4">
      <View class="h-12 flex-row items-center justify-between px-(--layout-padding) pb-4">
        <Text class={cn("font-mono text-2xl line-clamp-1", displayCase(), displayWeight())}>
          {formatMonth(activeDate(), "long")}{" "}
          <Text class="text-brand font-normal">{activeDate().year}</Text>
        </Text>
        <View class="flex-row items-center gap-1">
          <Button variant="ghost" size="icon-xs" round onPress={() => shiftMonth(-1)}>
            <ChevronUpIcon class="size-4" />
          </Button>
          <Button variant="ghost" size="icon-xs" round onPress={() => shiftMonth(1)}>
            <ChevronDownIcon class="size-4" />
          </Button>
        </View>
      </View>
      <Weekdays />
      <Each of={ROWS}>{(week) => <Week index={week} />}</Each>
    </View>
  )
}
