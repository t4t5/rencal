import { type JSX, Text, View } from "nsh"

import { cn } from "@/lib/utils"

export function KbdGroup(props: { class?: string; children?: JSX.Element }) {
  return <View class={cn("flex-row items-center gap-1", props.class)}>{props.children}</View>
}

/** One key: a label, or an icon as its child. */
export function Kbd(props: { label?: string; class?: string; children?: JSX.Element }) {
  return (
    <View
      class={cn(
        "h-5 min-w-5 flex-row items-center justify-center gap-1 rounded-(--radius-sm) bg-hover px-1",
        props.class,
      )}
    >
      <If when={props.label}>
        <Text class="text-xs font-medium text-muted-foreground">{props.label}</Text>
      </If>
      {props.children}
    </View>
  )
}
