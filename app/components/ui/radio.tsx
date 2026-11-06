import { type JSX, View } from "nsh"
import { Radio as BaseRadio, RadioGroup } from "nsh/base"

import { cn } from "@/lib/utils"

export { RadioGroup }

export function Radio(props: {
  checked?: boolean
  disabled?: boolean
  onSelect?: () => void
  class?: string
  children?: JSX.Element
}) {
  return (
    <BaseRadio
      checked={props.checked}
      disabled={props.disabled}
      onChange={() => props.onSelect?.()}
      class={cn("group flex-row items-center gap-2", props.class)}
    >
      <View class="size-4 items-center justify-center rounded-(--radius-circle) border border-input group-checked:border-primary">
        <View class="size-2 rounded-(--radius-circle) bg-primary opacity-0 group-checked:opacity-100" />
      </View>
      {props.children}
    </BaseRadio>
  )
}
