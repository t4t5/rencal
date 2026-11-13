import { Text } from "nsh"

import { ItemContent, ItemMedia } from "@/components/ui/item"
import { Select } from "@/components/ui/select"

import type { EventAvailability } from "@/lib/cal-events"
import { cn } from "@/lib/utils"

const OPTIONS: { value: EventAvailability; title: string }[] = [
  { value: "busy", title: "Busy" },
  { value: "free", title: "Free" },
]

export function AvailabilitySelect(props: {
  value: EventAvailability
  onChange: (availability: EventAvailability) => void
  readOnly?: boolean
}) {
  return (
    <Select
      class="w-full"
      triggerClass={cn("w-full", props.readOnly && "hover:border-transparent disabled:opacity-100")}
      items={OPTIONS}
      value={props.value}
      disabled={props.readOnly}
      onChange={(next) => {
        if (next === "busy" || next === "free") props.onChange(next)
      }}
      accessibilityLabel="Show as"
      label={
        <>
          {/* Empty, so the text starts at the column of the rows with icons. */}
          <ItemMedia />
          <ItemContent>
            <Text class="truncate text-sm text-foreground">
              {props.value === "busy" ? "Busy" : "Free"}
            </Text>
          </ItemContent>
        </>
      }
    />
  )
}
