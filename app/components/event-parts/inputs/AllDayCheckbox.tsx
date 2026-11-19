import { Text } from "nsh"

import { Checkbox } from "@/components/ui/checkbox"

import { cn } from "@/lib/utils"

import { typography } from "@/themes"

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
      <Text
        class={cn(typography.body(), props.checked ? "text-foreground" : "text-muted-foreground")}
      >
        All-day
      </Text>
    </Checkbox>
  )
}
