import { Temporal } from "@js-temporal/polyfill"
import { type JSX, signal, Text, View } from "nsh"

import { Button } from "@/components/ui/button"
import { Popover } from "@/components/ui/popover"
import { Select } from "@/components/ui/select"

import {
  epochDay,
  formatMonth,
  formatShortDate,
  isoWeekNumber,
  plainDateFromEpochDay,
  startOfWeek,
} from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { ChevronLeftIcon, ChevronRightIcon } from "@/icons"
import { currentDay } from "@/stores/clock"
import { firstDayOfWeek, showWeekNumbers } from "@/stores/settings"
import { typography } from "@/themes"

// Indexed by day number, 0 = Sunday.
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
// Always six weeks, so paging through months doesn't resize the popup.
const ROWS = Array.from({ length: 6 }, (_, week) => week)
const COLUMNS = Array.from({ length: 7 }, (_, column) => column)
const YEARS_AROUND = 100

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  title: formatMonth(Temporal.PlainDate.from({ year: 2000, month: i + 1, day: 1 }), "short"),
}))

function yearItems(shown: number) {
  const now = currentDay().year
  const from = Math.min(now - YEARS_AROUND, shown)
  const to = Math.max(now + YEARS_AROUND, shown)
  return Array.from({ length: to - from + 1 }, (_, i) => ({
    value: String(from + i),
    title: String(from + i),
  }))
}

const weekdayIndex = (column: number) => (firstDayOfWeek() === "sunday" ? column : (column + 1) % 7)

function Day(props: {
  day: () => number
  month: () => number
  selected: () => number
  onSelect: (date: Temporal.PlainDate) => void
}) {
  const date = () => plainDateFromEpochDay(props.day())
  const selected = () => props.day() === props.selected()
  const isToday = () => props.day() === epochDay(currentDay())
  const outside = () => date().month !== props.month()
  return (
    <View
      role="button"
      testID={`date-picker-${date().toString()}`}
      onPress={() => props.onSelect(date())}
      class={cn(
        "h-8 min-w-8 flex-1 items-center justify-center rounded-(--radius-md)",
        selected() ? (isToday() ? "bg-today" : "bg-selected") : "hover:bg-accent",
      )}
    >
      <Text
        class={cn(
          typography.body(),
          outside() ? "text-muted-foreground" : "text-foreground",
          isToday() && (selected() ? "text-today-foreground" : "text-today"),
          !isToday() && selected() && "text-selected-foreground",
        )}
      >
        {date().day}
      </Text>
    </View>
  )
}

/** One month's weeks under a header of arrows and month and year selects. */
function MonthCalendar(props: {
  selected: Temporal.PlainDate
  onSelect: (date: Temporal.PlainDate) => void
}) {
  // The content is made on each opening, so it starts on the picked date's month.
  const shown = signal(props.selected.with({ day: 1 }))
  const gridStart = () => epochDay(startOfWeek(shown(), firstDayOfWeek()))
  const selectedDay = () => epochDay(props.selected)
  const shift = (months: number) => shown.set(shown().add({ months }))

  return (
    <View>
      <View class="flex-row items-center justify-between gap-1.5 pb-4">
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Previous month"
          onPress={() => shift(-1)}
        >
          <ChevronLeftIcon class="size-4" />
        </Button>
        <View class="flex-row items-center gap-1.5">
          <Select
            variant="default"
            triggerClass="w-20"
            accessibilityLabel="Month"
            items={MONTHS}
            value={String(shown().month)}
            onChange={(value) => value && shown.set(shown().with({ month: Number(value) }))}
          />
          <Select
            variant="default"
            triggerClass="w-20"
            // Wider than the trigger, so a year fits beside the check.
            popupClass="min-w-28"
            accessibilityLabel="Year"
            items={yearItems(shown().year)}
            value={String(shown().year)}
            onChange={(value) => value && shown.set(shown().with({ year: Number(value) }))}
          />
        </View>
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Next month"
          onPress={() => shift(1)}
        >
          <ChevronRightIcon class="size-4" />
        </Button>
      </View>
      <View class="flex-row pb-1">
        <If when={showWeekNumbers()}>
          <View class="w-8" />
        </If>
        <Each of={COLUMNS}>
          {(column) => (
            <View class="min-w-8 flex-1 items-center">
              <Text class={cn(typography.numericalSm(), "text-muted-foreground")}>
                {WEEKDAYS[weekdayIndex(column())]}
              </Text>
            </View>
          )}
        </Each>
      </View>
      <Each of={ROWS}>
        {(week) => {
          const firstDay = () => gridStart() + week() * 7
          return (
            <View class="flex-row">
              <If when={showWeekNumbers()}>
                <View class="w-8 items-center justify-center">
                  <Text class={cn(typography.numericalSm(), "text-muted-foreground")}>
                    {isoWeekNumber(plainDateFromEpochDay(firstDay()), firstDayOfWeek())}
                  </Text>
                </View>
              </If>
              <Each of={COLUMNS}>
                {(column) => (
                  <Day
                    day={() => firstDay() + column()}
                    month={() => shown().month}
                    selected={selectedDay}
                    onSelect={props.onSelect}
                  />
                )}
              </Each>
            </View>
          )
        }}
      </Each>
    </View>
  )
}

export function DatePicker(props: {
  date: Temporal.PlainDate
  setDate: (date: Temporal.PlainDate) => void
  addon?: JSX.Element
  class?: string
  readOnly?: boolean
}) {
  const open = signal(false)
  return (
    <Popover
      open={open()}
      onOpenChange={(event) => open.set(event.open && !props.readOnly)}
      align="start"
      popupClass="p-3"
      trigger={
        <View
          accessibilityLabel="Date"
          class={cn(
            "h-(--control-height) flex-row items-center gap-2 rounded-(--radius-md) border border-transparent px-2",
            !props.readOnly &&
              "hover:border-input aria-expanded:border-transparent aria-expanded:bg-secondary focus-visible:bg-secondary",
            props.class,
          )}
        >
          {props.addon}
          <Text class={cn(typography.body(), "text-foreground")}>
            {formatShortDate(props.date)}
          </Text>
        </View>
      }
    >
      <MonthCalendar
        selected={props.date}
        onSelect={(date) => {
          props.setDate(date)
          open.set(false)
        }}
      />
    </Popover>
  )
}
