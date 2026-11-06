import type { InputRef } from "nsh"
import { split } from "nsh"
import { Input as BaseInput, type InputProps } from "nsh/base"

import { cn } from "@/lib/utils"

type Props = InputProps & {
  /** `ghost` shows no box until hovered or focused, `default` always does. */
  variant?: "ghost" | "default"
  invalid?: boolean
  ref?: InputRef | ((ref: InputRef) => void)
}

const INPUT_TEXT = "text-sm text-foreground placeholder:text-placeholder-foreground"

/** Text input with the old field look: no box until hovered or focused. */
export function Input(props: Props) {
  const [own, rest] = split(props, ["class", "variant", "invalid"])
  return (
    <BaseInput
      {...rest}
      class={cn(
        INPUT_TEXT,
        "h-(--control-height) w-full rounded-(--radius-md) border px-2",
        "border-transparent hover:border-input focus:border-transparent focus:bg-secondary",
        own.variant === "default" && "bg-secondary",
        own.invalid && "border-destructive",
        own.class,
      )}
    />
  )
}

/** The text alone, for a control whose wrapper owns height and border. */
export function InputInner(props: Props) {
  const [own, rest] = split(props, ["class"])
  return <BaseInput {...rest} class={cn(INPUT_TEXT, "min-w-0 flex-1", own.class)} />
}
