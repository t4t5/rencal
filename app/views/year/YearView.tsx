import { Temporal } from "@js-temporal/polyfill"
import { computed, effect, Scroll, signal, Text, View } from "nsh"

import { Button } from "@/components/ui/button"

import type { CalendarEvent } from "@/lib/cal-events"
import { epochDay, formatMonth, startOfWeek } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { ChevronLeftIcon, ChevronRightIcon } from "@/icons"
import { activeDate, navigateToDate } from "@/stores/calendar"
import { currentDay } from "@/stores/clock"
import { calendarEvents, holdRange } from "@/stores/events"
import { firstDayOfWeek } from "@/stores/settings"
import { displayCase, displayWeight } from "@/themes"
import { paintOf } from "@/views/event-block"

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const MAX_DOTS = 3
// Every month gets six rows so the months line up across the grid.
const GRID_WEEKS = [0, 1, 2, 3, 4, 5]
const COLUMNS = [0, 1, 2, 3, 4, 5, 6]
const WEEKDAY_LETTERS = {
  monday: ["M", "T", "W", "T", "F", "S", "S"],
  sunday: ["S", "M", "T", "W", "T", "F", "S"],
}

const isWeekend = (date: Temporal.PlainDate) => date.dayOfWeek >= 6

/** Up to MAX_DOTS events per epoch day in [firstDay, lastDay], one per calendar. */
function dotsByDay(events: readonly CalendarEvent[], firstDay: number, lastDay: number) {
  const byDay = new Map<number, CalendarEvent[]>()
  for (const event of events) {
    const from = Math.max(event.dateInfo.firstDay, firstDay)
    const to = Math.min(event.dateInfo.lastDay, lastDay)
    for (let day = from; day <= to; day++) {
      const dots = byDay.get(day)
      if (!dots) {
        byDay.set(day, [event])
      } else if (
        dots.length < MAX_DOTS &&
        !dots.some((dot) => dot.calendar_slug === event.calendar_slug)
      ) {
        dots.push(event)
      }
    }
  }
  return byDay
}

function YearDay(props: { date: () => Temporal.PlainDate; dots: () => CalendarEvent[] }) {
  const selected = () => props.date().equals(activeDate())
  const isToday = () => props.date().equals(currentDay())
  return (
    <View
      role="button"
      onPress={() => navigateToDate(props.date())}
      class={cn(
        "group relative flex-1 min-w-0 h-8 items-center pt-1",
        isWeekend(props.date()) && "bg-weekend",
      )}
    >
      <View
        class={cn(
          "size-5 items-center justify-center rounded-(--radius-circle)",
          isToday() && "bg-today",
          selected() && !isToday() && "bg-selected",
          !isToday() && !selected() && "group-hover:bg-hover",
        )}
      >
        <Text
          class={cn(
            "font-mono text-xs",
            isToday() && "text-today-foreground",
            selected() && !isToday() && "text-selected-foreground",
          )}
        >
          {props.date().day}
        </Text>
      </View>
      <If when={props.dots().length > 0}>
        <View class="absolute bottom-0.5 left-0 right-0 flex-row justify-center gap-[3px]">
          <Each of={props.dots()}>
            {(event) => (
              <View
                class="size-1 rounded-(--radius-circle)"
                style={{ backgroundColor: paintOf(event()).color }}
              />
            )}
          </Each>
        </View>
      </If>
    </View>
  )
}

function YearMonth(props: {
  year: () => number
  month: () => number
  dots: () => Map<number, CalendarEvent[]>
}) {
  const start = computed(() =>
    Temporal.PlainDate.from({ year: props.year(), month: props.month(), day: 1 }),
  )
  const gridStart = computed(() => startOfWeek(start(), firstDayOfWeek()))
  const dateAt = (week: number, column: number) => gridStart().add({ days: week * 7 + column })

  return (
    <View class="flex-1 gap-1 min-w-0">
      <Text class="self-start px-1 text-sm font-medium">{formatMonth(start(), "long")}</Text>
      <View>
        <View class="flex-row">
          <Each of={COLUMNS}>
            {(column) => (
              <View
                class={cn(
                  "flex-1 min-w-0 items-center py-1",
                  isWeekend(dateAt(0, column())) && "bg-weekend",
                )}
              >
                <Text
                  class={cn("font-mono text-2xs font-medium text-muted-foreground", displayCase())}
                >
                  {WEEKDAY_LETTERS[firstDayOfWeek()][column()]}
                </Text>
              </View>
            )}
          </Each>
        </View>
        <Each of={GRID_WEEKS}>
          {(week) => (
            <View class="flex-row">
              <Each of={COLUMNS}>
                {(column) => {
                  const date = () => dateAt(week(), column())
                  return (
                    <If
                      when={date().month === props.month()}
                      else={
                        <View class={cn("flex-1 min-w-0 h-8", isWeekend(date()) && "bg-weekend")} />
                      }
                    >
                      <YearDay date={date} dots={() => props.dots().get(epochDay(date())) ?? []} />
                    </If>
                  )
                }}
              </Each>
            </View>
          )}
        </Each>
      </View>
    </View>
  )
}

export function YearView() {
  const width = signal(0)
  const year = () => activeDate().year
  const firstDay = computed(() => Temporal.PlainDate.from({ year: year(), month: 1, day: 1 }))
  const nextYear = computed(() => firstDay().add({ years: 1 }))
  const dots = computed(() =>
    dotsByDay(calendarEvents(), epochDay(firstDay()), epochDay(nextYear()) - 1),
  )

  effect(() => holdRange({ start: firstDay(), end: nextYear() }))

  // As the old grid's container queries: 2, 3 or 4 months across.
  const columns = () => (width() < 672 ? 2 : width() < 1024 ? 3 : 4)
  const rows = () => {
    const across = columns()
    return Array.from({ length: 12 / across }, (_, row) =>
      MONTHS.slice(row * across, (row + 1) * across),
    )
  }

  return (
    <View class="flex-1 min-h-0">
      <View class="flex-row items-center justify-between shrink-0 px-(--layout-padding) pb-2">
        <Text class={cn("font-mono text-2xl", displayCase(), displayWeight())}>{year()}</Text>
        <View class="flex-row items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            round
            testID="year-previous"
            onPress={() => navigateToDate(activeDate().subtract({ years: 1 }))}
          >
            <ChevronLeftIcon class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            round
            testID="year-next"
            onPress={() => navigateToDate(activeDate().add({ years: 1 }))}
          >
            <ChevronRightIcon class="size-4" />
          </Button>
        </View>
      </View>
      <Scroll
        class="flex-1 min-h-0"
        onLayout={({ bounds }) => width.set(bounds.size.width)}
        contentClass="gap-6 px-(--layout-padding) pb-(--layout-padding)"
      >
        <If when={width() > 0}>
          <Each of={rows()} key="index">
            {(row) => (
              <View class="flex-row gap-6">
                <Each of={row()} key="index">
                  {(month) => <YearMonth year={year} month={month} dots={dots} />}
                </Each>
              </View>
            )}
          </Each>
        </If>
      </Scroll>
    </View>
  )
}
