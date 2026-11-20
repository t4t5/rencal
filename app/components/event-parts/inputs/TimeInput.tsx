import { type JSX, signal, Text, token, View } from "nsh"
import { FocusWatch } from "rencal/native"

import { Combobox } from "@/components/ui/combobox"

import { type EventTime, formatWallclockTime, isAllDay, wallclockTime } from "@/lib/event-time"
import { timeKey, timeOptions } from "@/lib/time-options"
import { cn } from "@/lib/utils"

import { ChevronDownIcon } from "@/icons"
import { timeFormat } from "@/stores/settings"
import { typography } from "@/themes"

/**
 * A time of day picked from quarter-hour slots or typed ("3pm", "15:30"), in
 * the clock the user set. Edits the wallclock time in the event's own zone.
 */
export function TimeInput(props: {
  value: EventTime
  prefix?: JSX.Element
  disabled?: boolean
  accessibilityLabel?: string
  class?: string
  onChange: (hour: number, minute: number) => void
}) {
  const query = signal("")
  const open = signal(false)
  const current = () => (isAllDay(props.value) ? null : wallclockTime(props.value))
  const currentKey = () => (current() ? timeKey(current()!) : null)
  const label = (key: string) => {
    const [hour, minute] = key.split(":").map(Number)
    return formatWallclockTime(hour!, minute!, timeFormat())
  }
  // The combobox filters by title, so while typing a title carries the query:
  // "3pm" has to find "15:00". Untyped, the current row's title is empty so the
  // input holds no text and the time shows as its placeholder.
  const items = () => {
    const typed = query()
    return timeOptions(typed, timeFormat(), current()).map((t) => {
      const key = timeKey(t)
      return {
        value: key,
        title: !typed && key === currentKey() ? "" : `${typed} ${label(key)}`.trim(),
      }
    })
  }

  return (
    // Linux inputs report no presses, so the list opens as the field takes focus.
    <FocusWatch onFocusIn={() => !props.disabled && open.set(true)}>
      <Combobox
        // No gaps or end padding: the input and the chevron fill the row, so
        // every point of it takes a press.
        class={cn("w-auto gap-0 px-0", props.disabled && "hover:border-transparent", props.class)}
        // Sized to the widest label, so the field keeps its width as it's edited.
        inputClass={cn(
          "flex-none pl-2",
          timeFormat() === "12h" ? "w-[76px]" : "w-[52px]",
          !open() && "placeholder:text-foreground",
        )}
        placeholder={currentKey() ? label(currentKey()!) : ""}
        popupClass="min-w-32"
        accessibilityLabel={props.accessibilityLabel}
        disabled={props.disabled}
        items={items()}
        value={currentKey() ? [currentKey()!] : []}
        query={query()}
        onQueryChange={(event) => query.set(event.query)}
        open={open()}
        onOpenChange={(event) => {
          open.set(event.open)
          if (!event.open) query.set("")
        }}
        onChange={({ value }) => {
          query.set("")
          const key = value[0]
          if (!key || key === currentKey()) return
          const [hour, minute] = key.split(":").map(Number)
          props.onChange(hour!, minute!)
        }}
        prefix={
          <If when={props.prefix}>
            <View class="pl-2">{props.prefix}</View>
          </If>
        }
        triggerButton={
          <View class={cn("self-stretch justify-center px-2", props.disabled && "opacity-0")}>
            <ChevronDownIcon class="size-3" color={token("muted-foreground")} />
          </View>
        }
        renderItem={(item) => (
          <View class="px-2 py-1.5">
            <Text class={typography.body()}>{label(item.value)}</Text>
          </View>
        )}
      />
    </FocusWatch>
  )
}
