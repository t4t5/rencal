import { Text } from "nsh"

import { ItemContent, ItemMedia } from "@/components/ui/item"
import { Select } from "@/components/ui/select"
import { StatusDot } from "@/components/ui/status-dot"

import type { ResponseStatus } from "@/lib/cal-events"
import { cn } from "@/lib/utils"

const OPTIONS: { value: ResponseStatus; title: string }[] = [
  { value: "accepted", title: "Accepted" },
  { value: "declined", title: "Declined" },
  { value: "tentative", title: "Maybe" },
]

export function RsvpSelect(props: {
  status?: ResponseStatus | null
  onRsvp: (response: ResponseStatus) => void
}) {
  const selected = () => OPTIONS.find((option) => option.value === props.status)
  return (
    <Select
      class="w-full"
      triggerClass="w-full"
      items={OPTIONS}
      value={props.status ?? null}
      onChange={(value) => value && props.onRsvp(value as ResponseStatus)}
      accessibilityLabel="My status"
      leading={(item) => <StatusDot status={item.value as ResponseStatus} />}
      label={
        <>
          <ItemMedia>
            <StatusDot status={props.status} />
          </ItemMedia>
          <ItemContent>
            <Text
              class={cn(
                "truncate text-sm",
                selected() ? "text-foreground" : "text-placeholder-foreground",
              )}
            >
              {selected()?.title ?? "My status"}
            </Text>
          </ItemContent>
        </>
      }
    />
  )
}
