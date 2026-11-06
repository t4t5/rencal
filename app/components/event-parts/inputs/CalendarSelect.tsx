import { Text, View } from "nsh"

import { ItemContent, ItemMedia } from "@/components/ui/item"
import { Select } from "@/components/ui/select"

import type { Calendar } from "@/lib/api"
import { eventPaint } from "@/lib/event-paint"
import { cn } from "@/lib/utils"

import { calendarOf, calendars } from "@/stores/calendar"

const Swatch = (props: { calendar?: Calendar }) => (
  <View
    class="size-3 shrink-0 rounded-(--radius-xs)"
    style={{ backgroundColor: eventPaint(props.calendar?.color ?? null).color }}
  />
)

export function CalendarSelect(props: {
  calendar?: Calendar
  onChange: (calendarId: string) => void
  readOnly?: boolean
}) {
  const items = () =>
    calendars()
      .filter((calendar) => !calendar.read_only)
      .map((calendar) => ({ value: calendar.slug, title: calendar.name || calendar.slug }))

  return (
    <Select
      class="w-full"
      triggerClass={cn("w-full", props.readOnly && "hover:border-transparent disabled:opacity-100")}
      items={items()}
      value={props.calendar?.slug ?? null}
      disabled={props.readOnly}
      onChange={(slug) => slug && props.onChange(slug)}
      accessibilityLabel="Calendar"
      leading={(item) => <Swatch calendar={calendarOf(item.value)} />}
      label={
        <>
          <ItemMedia>
            <If when={props.calendar}>
              <Swatch calendar={props.calendar} />
            </If>
          </ItemMedia>
          <ItemContent>
            <Text class="truncate text-sm text-foreground">
              {props.calendar ? props.calendar.name || props.calendar.slug : "Select Calendar"}
            </Text>
          </ItemContent>
        </>
      }
    />
  )
}
