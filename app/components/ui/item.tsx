import { type JSX, View } from "nsh"

import { cn } from "@/lib/utils"

/** A form row: its media, content and actions line up with the fields around it. */
export function Item(props: {
  variant?: "default" | "accent"
  class?: string
  children?: JSX.Element
}) {
  return (
    <View
      class={cn(
        "min-w-0 flex-row items-center gap-2 px-2",
        props.variant === "accent" &&
          "group h-(--control-height) rounded-(--radius-md) border border-transparent hover:bg-accent focus-within:bg-accent",
        props.class,
      )}
    >
      {props.children}
    </View>
  )
}

export function ItemMedia(props: { class?: string; children?: JSX.Element }) {
  return (
    <View class={cn("size-4 shrink-0 items-center justify-center", props.class)}>
      {props.children}
    </View>
  )
}

export function ItemContent(props: { class?: string; children?: JSX.Element }) {
  return <View class={cn("min-w-0 flex-1", props.class)}>{props.children}</View>
}
