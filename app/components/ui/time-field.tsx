import { TimeField as BaseTimeField } from "nsh/base"

import { cn } from "@/lib/utils"

import { timeFormat } from "@/stores/settings"

const pad = (value: number) => String(value).padStart(2, "0")

/** A time of day, typed segment by segment, in the clock the user set. */
export function TimeField(props: {
  hour: number
  minute: number
  disabled?: boolean
  accessibilityLabel?: string
  class?: string
  onChange: (hour: number, minute: number) => void
}) {
  return (
    <BaseTimeField
      value={`${pad(props.hour)}:${pad(props.minute)}`}
      hourCycle={timeFormat() === "12h" ? "h12" : "h23"}
      disabled={props.disabled}
      accessibilityLabel={props.accessibilityLabel}
      onChange={({ value }) => {
        const [hour, minute] = value.split(":").map(Number)
        props.onChange(hour!, minute!)
      }}
      class={cn(
        "h-(--control-height) flex-row items-center rounded-(--radius-md) border border-transparent px-2",
        !props.disabled &&
          "hover:border-input focus-within:border-transparent focus-within:bg-secondary",
        props.class,
      )}
      segmentClass="rounded-(--radius-xs) text-sm text-foreground focus:bg-accent"
      separatorClass="text-sm text-foreground"
    />
  )
}
