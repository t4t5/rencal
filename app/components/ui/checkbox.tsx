import { type JSX, token } from "nsh"
import { Checkbox as BaseCheckbox } from "nsh/base"

import { cn } from "@/lib/utils"

import { CheckIcon } from "@/icons"

export function Checkbox(props: {
  checked?: boolean
  disabled?: boolean
  onChange?: (checked: boolean) => void
  accessibilityLabel?: string
  /** The fill while checked, for a calendar's color; `primary` otherwise. */
  color?: string
  class?: string
  children?: JSX.Element
}) {
  return (
    <BaseCheckbox
      checked={props.checked}
      disabled={props.disabled}
      accessibilityLabel={props.accessibilityLabel}
      onChange={({ checked }) => props.onChange?.(checked)}
      class={cn("flex-row items-center gap-2 disabled:opacity-50", props.class)}
      indicatorClass="size-4 shrink-0 items-center justify-center rounded-(--radius-xs) border border-input checked:border-primary checked:bg-primary"
      indicatorStyle={
        props.checked && props.color
          ? { backgroundColor: props.color, borderColor: props.color }
          : undefined
      }
      indicator={
        <If when={props.checked}>
          <CheckIcon class="size-3.5" color={token("primary-foreground")} />
        </If>
      }
    >
      {props.children}
    </BaseCheckbox>
  )
}
