import { type JSX, Text } from "nsh"
import { Button as BaseButton } from "nsh/base"

import { cn } from "@/lib/utils"

import { displayCase } from "@/themes"

type Variant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"
type Size = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"

const VARIANTS: Record<Variant, string> = {
  default: "bg-primary hover:bg-primary-hover",
  secondary: "bg-secondary hover:bg-secondary-hover border border-button-border",
  destructive: "bg-destructive hover:bg-destructive-hover",
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

export function Button(props: {
  variant?: Variant
  size?: Size
  round?: boolean
  disabled?: boolean
  class?: string
  label?: string
  accessibilityLabel?: string
  testID?: string
  onPress?: () => void
  children?: JSX.Element
}) {
  const variant = () => props.variant ?? "default"
  return (
    <BaseButton
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityLabel={props.accessibilityLabel}
      testID={props.testID}
      class={cn(
        "flex-row items-center justify-center gap-2 shrink-0 disabled:opacity-50",
        props.round ? "rounded-(--radius-circle)" : "rounded-(--radius-md)",
        VARIANTS[variant()],
        SIZES[props.size ?? "default"],
        props.class,
      )}
    >
      <If when={props.label}>
        <Text class={cn("font-mono text-sm font-medium", displayCase(), LABELS[variant()])}>
          {props.label}
        </Text>
      </If>
      {props.children}
    </BaseButton>
  )
}
