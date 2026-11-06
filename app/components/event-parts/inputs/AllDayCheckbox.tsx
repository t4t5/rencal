import { Text } from "nsh"

import { Checkbox } from "@/components/ui/checkbox"

import { cn } from "@/lib/utils"

export function AllDayCheckbox(props: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  readOnly?: boolean
}) {
  return (
    <Checkbox
      checked={props.checked}
      disabled={props.readOnly}
      onChange={props.onCheckedChange}
      class="h-(--control-height) w-fit border border-transparent px-2 disabled:opacity-100"
    >
      <Text class={cn("text-sm", props.checked ? "text-foreground" : "text-muted-foreground")}>
        All-day
      </Text>
    </Checkbox>
  )
}
