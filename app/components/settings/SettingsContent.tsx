import { type JSX, Scroll, Text, View } from "nsh"

import { cn } from "@/lib/utils"

import { displayCase, displayWeight } from "@/themes"

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

/** A titled card of `SettingsRow`s, as a system settings pane groups them. */
export function SettingsSection(props: { title: string; class?: string; children?: JSX.Element }) {
  return (
    <View class={cn("gap-2", props.class)}>
      <Text class={cn("px-1 font-mono text-sm", displayCase(), displayWeight())}>
        {props.title}
      </Text>
      <View class="overflow-hidden rounded-(--radius-lg) bg-card">
        {/* Every row draws the line above it; this tucks the first row's under the card's edge. */}
        <View class="-mt-px">{props.children}</View>
      </View>
    </View>
  )
}

/**
 * One setting in a `SettingsSection`: its name, a line about it and `detail` under
 * that, with its control on the right.
 */
export function SettingsRow(props: {
  label: string
  description?: string
  detail?: JSX.Element
  children?: JSX.Element
}) {
  return (
    <View class="mx-4 flex-row items-start gap-4 border-t border-border py-2">
      <View class="min-h-(--control-height) min-w-0 flex-1 justify-center gap-0.5">
        <Text class="text-sm">{props.label}</Text>
        <If when={props.description}>
          <Text class="text-xs text-muted-foreground">{props.description}</Text>
        </If>
        {props.detail}
      </View>
      <View class="min-h-(--control-height) shrink-0 flex-row items-center gap-2">
        {props.children}
      </View>
    </View>
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
