import { Text } from "nsh"
import { Tooltip as BaseTooltip } from "nsh/base"

/** Goes in a view's `tooltip` prop: `<View tooltip={<Tooltip label="Save" />}>`. */
export function Tooltip(props: {
  label: string
  placement?: "top" | "bottom" | "left" | "right"
  delay?: number
}) {
  return (
    <BaseTooltip
      placement={props.placement}
      delay={props.delay ?? 0}
      class="rounded-(--radius-md) bg-tooltip px-3 py-1.5"
    >
      <Text class="text-xs text-tooltip-foreground">{props.label}</Text>
    </BaseTooltip>
  )
}
