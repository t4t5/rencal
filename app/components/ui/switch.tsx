import { type JSX } from "nsh"
import { Switch as BaseSwitch } from "nsh/base"

import { cn } from "@/lib/utils"

export function Switch(props: {
  checked?: boolean
  disabled?: boolean
  onChange?: (checked: boolean) => void
  accessibilityLabel?: string
  class?: string
  children?: JSX.Element
}) {
  return (
    <BaseSwitch
      checked={props.checked}
      disabled={props.disabled}
      accessibilityLabel={props.accessibilityLabel}
      onChange={({ checked }) => props.onChange?.(checked)}
      class={cn("flex-row items-center gap-2 disabled:opacity-50", props.class)}
      trackClass="h-5 w-9 justify-center rounded-(--radius-circle) bg-input px-0.5 transition-colors duration-150 checked:bg-primary"
      thumbClass="size-4 rounded-(--radius-circle) bg-foreground transition-transform duration-150 checked:translate-x-4 checked:bg-primary-foreground"
    >
      {props.children}
    </BaseSwitch>
  )
}
