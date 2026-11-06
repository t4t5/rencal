import { Temporal } from "@js-temporal/polyfill"
import { type JSX, Text, View } from "nsh"
import { type CalendarEntry, DatePicker as BaseDatePicker } from "nsh/base"

import { formatMonth, formatShortDate } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { ChevronLeftIcon, ChevronRightIcon } from "@/icons"
import { firstDayOfWeek } from "@/stores/settings"

import { POPUP_SURFACE } from "./popover"

const ITEM =
  "group min-h-8 min-w-8 flex-1 items-center justify-center whitespace-nowrap rounded-(--radius-sm) text-sm text-foreground hover:bg-accent focus:bg-accent selected:bg-primary selected:text-primary-foreground data-outside:text-muted-foreground disabled:opacity-50"

// Indexed by day number, 0 = Sunday.
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

const monthName = (month: number) =>
  formatMonth(Temporal.PlainDate.from({ year: 2000, month, day: 1 }), "short")

function CalendarItem(props: { item: CalendarEntry }) {
  const { kind, value } = props.item
  if (kind === "previous") return <ChevronLeftIcon />
  if (kind === "next") return <ChevronRightIcon />
  if (kind === "weekday") {
    return <Text class="text-2xs text-muted-foreground">{WEEKDAYS[value]}</Text>
  }
  const isMonth = kind === "month" || kind === "monthToggle"
  return <Text class="text-sm">{isMonth ? monthName(value) : String(value)}</Text>
}

export function DatePicker(props: {
  date: Temporal.PlainDate
  setDate: (date: Temporal.PlainDate) => void
  addon?: JSX.Element
  class?: string
  readOnly?: boolean
}) {
  return (
    <BaseDatePicker
      value={props.date.toString()}
      onChange={({ value }) => {
        if (typeof value === "string") props.setDate(Temporal.PlainDate.from(value))
      }}
      disabled={props.readOnly}
      firstDayOfWeek={firstDayOfWeek() === "sunday" ? 0 : 1}
      offset={4}
      margin={8}
      popupClass={cn(POPUP_SURFACE, "p-3")}
      headerClass="flex-row items-center justify-between pb-4"
      rowClass="flex-row"
      itemClass={ITEM}
      renderItem={(item) => <CalendarItem item={item} />}
      trigger={
        <View
          class={cn(
            "h-(--control-height) flex-row items-center gap-2 rounded-(--radius-md) border border-transparent px-2",
            !props.readOnly &&
              "hover:border-input aria-expanded:border-transparent aria-expanded:bg-secondary focus-visible:bg-secondary",
            props.class,
          )}
        >
          {props.addon}
          <Text class="text-sm text-foreground">{formatShortDate(props.date)}</Text>
        </View>
      }
    />
  )
}
