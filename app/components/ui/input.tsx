import { split } from "nsh"
import { Input as BaseInput, type InputProps } from "nsh/base"

import {
  BLUR_KEYS,
  type BlurProps,
  withBlurOnPressOutside,
} from "@/components/ui/blur-on-press-outside"

import { cn } from "@/lib/utils"

import { controlSurface, typography } from "@/themes"

type Props = Omit<InputProps, "ref"> &
  BlurProps & {
    /** `ghost` shows no box until hovered or focused, `default` always does. */
    variant?: "ghost" | "default"
    invalid?: boolean
  }

const inputText = () =>
  cn(typography.body(), "text-foreground placeholder:text-placeholder-foreground")

/** Text input with the old field look: no box until hovered or focused. */
export function Input(props: Props) {
  const [own, rest] = split(props, ["class", "variant", "invalid", ...BLUR_KEYS])
  return withBlurOnPressOutside(own, (handlers) => (
    <BaseInput
      {...rest}
      {...handlers}
      class={cn(
        inputText(),
        "h-(--control-height) w-full rounded-(--radius-md) border px-2",
        "border-transparent hover:border-input focus:border-transparent focus:bg-secondary",
        own.variant === "default" && "bg-secondary",
        controlSurface(),
        own.invalid && "border-destructive",
        own.class,
      )}
    />
  ))
}

/** The text alone, for a control whose wrapper owns height and border. */
export function InputInner(props: Omit<InputProps, "ref"> & BlurProps) {
  const [own, rest] = split(props, ["class", ...BLUR_KEYS])
  return withBlurOnPressOutside(own, (handlers) => (
    <BaseInput {...rest} {...handlers} class={cn(inputText(), "min-w-0 flex-1", own.class)} />
  ))
}
