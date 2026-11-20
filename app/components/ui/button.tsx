import { cleanup, effect, type JSX, Text, type ViewRef } from "nsh"
import { Button as BaseButton } from "nsh/base"

import { DialogFocus } from "@/components/ui/dialog"

import { cn } from "@/lib/utils"

import { buttonSurface, typography } from "@/themes"

type Variant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"
type Size = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"

const VARIANTS: Record<Variant, string> = {
  default: "bg-primary hover:bg-primary-hover",
  secondary: "bg-secondary hover:bg-secondary-hover border border-button-border",
  destructive: "bg-destructive hover:bg-destructive-hover focus-visible:ring-destructive/50",
  outline: "bg-background border border-input hover:bg-accent",
  ghost: "hover:bg-accent",
  link: "",
}

const LABELS: Record<Variant, string> = {
  default: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  destructive: "text-destructive-foreground",
  outline: "text-foreground",
  ghost: "text-foreground",
  link: "text-primary",
}

const SIZES: Record<Size, string> = {
  default: "h-(--control-height) px-3",
  xs: "h-(--control-height-xs) gap-1 px-2",
  sm: "h-(--control-height-sm) gap-1.5 px-3",
  lg: "h-(--control-height-lg) px-6",
  icon: "w-(--control-height) h-(--control-height)",
  "icon-xs": "w-(--control-height-xs) h-(--control-height-xs)",
  "icon-sm": "w-(--control-height-sm) h-(--control-height-sm)",
  "icon-lg": "w-(--control-height-lg) h-(--control-height-lg)",
}

/** A button's surface, for a trigger that has to look like one. */
export function buttonClass(variant: Variant = "default", size: Size = "default") {
  return cn(
    "flex-row items-center justify-center gap-2 shrink-0 disabled:opacity-50 rounded-(--radius-md)",
    "focus-visible:ring-[3px] focus-visible:ring-ring/50",
    VARIANTS[variant],
    SIZES[size],
    buttonSurface(),
  )
}

/** A button's label text. */
export function buttonLabelClass(variant: Variant = "default") {
  return cn(typography.button(), LABELS[variant])
}

export function Button(props: {
  variant?: Variant
  size?: Size
  round?: boolean
  disabled?: boolean
  class?: string
  label?: string
  accessibilityLabel?: string
  testID?: string
  /** Focused once the dialog it's in has opened, so Return presses it. */
  autoFocus?: boolean
  viewRef?: (ref: ViewRef) => void
  onPress?: () => void
  children?: JSX.Element
}) {
  const variant = () => props.variant ?? "default"
  const claimFocus = DialogFocus()
  let ref: ViewRef | undefined
  effect(() => {
    if (props.autoFocus && claimFocus) cleanup(claimFocus(() => ref))
  })
  return (
    <BaseButton
      ref={(view) => {
        ref = view
        props.viewRef?.(view)
      }}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityLabel={props.accessibilityLabel}
      testID={props.testID}
      class={cn(
        buttonClass(variant(), props.size),
        props.round && "rounded-(--radius-circle)",
        props.class,
      )}
    >
      <If when={props.label}>
        <Text class={buttonLabelClass(variant())}>{props.label}</Text>
      </If>
      {props.children}
    </BaseButton>
  )
}
