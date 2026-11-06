import { type JSX, Scroll, Text, View } from "nsh"

import { cn } from "@/lib/utils"

/** A page's scrolling column. */
export function SettingsContent(props: {
  class?: string
  contentClass?: string
  children?: JSX.Element
}) {
  return (
    <Scroll class={cn("min-h-0 flex-1", props.class)}>
      <View class={cn("gap-6 p-4", props.contentClass)}>{props.children}</View>
    </Scroll>
  )
}

/** A labelled control. */
export function SettingsField(props: { label: string; class?: string; children?: JSX.Element }) {
  return (
    <View class={cn("gap-2", props.class)}>
      <Text class="text-sm">{props.label}</Text>
      {props.children}
    </View>
  )
}

export function ErrorText(props: { message: string | null | undefined; class?: string }) {
  return (
    <If when={props.message}>
      <Text class={cn("text-sm text-destructive", props.class)}>{props.message}</Text>
    </If>
  )
}
