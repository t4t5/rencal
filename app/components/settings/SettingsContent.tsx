import { platform, type JSX, Scroll, Text, View } from "nsh"

import { needsNativeDecorations } from "@/lib/api/internal"
import { cn } from "@/lib/utils"

import { typography } from "@/themes"

/**
 * Settings draws its own close button in the top right: tiling compositors draw no title
 * bar, but GTK gives a dialog one of its own.
 */
export const settingsFrameless = platform.os === "linux" && !needsNativeDecorations()

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

/** A titled card of `SettingsRow`s, as a system settings pane groups them, with a note under it. */
export function SettingsSection(props: {
  title: string
  footer?: string
  class?: string
  children?: JSX.Element
}) {
  return (
    <View class={cn("gap-2", props.class)}>
      <Text class={cn(typography.section(), "px-1")}>{props.title}</Text>
      <View class="overflow-hidden rounded-(--radius-lg) bg-card">
        {/* Every row draws the line above it; this tucks the first row's under the card's edge. */}
        <View class="-mt-px">{props.children}</View>
      </View>
      <If when={props.footer}>
        <Text class={cn(typography.caption(), "px-1 text-muted-foreground")}>{props.footer}</Text>
      </If>
    </View>
  )
}

/** A row of a `SettingsSection` laid out by the caller: the card's inset and the line above it. */
export function SettingsItem(props: { class?: string; children?: JSX.Element }) {
  return (
    <View class={cn("mx-4 flex-row items-center gap-3 border-t border-border py-2", props.class)}>
      {props.children}
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
    <SettingsItem class="items-start gap-4">
      <View class="min-h-(--control-height) min-w-0 flex-1 justify-center gap-0.5">
        <Text class={typography.body()}>{props.label}</Text>
        <If when={props.description}>
          <Text class={cn(typography.caption(), "text-muted-foreground")}>{props.description}</Text>
        </If>
        {props.detail}
      </View>
      <View class="min-h-(--control-height) shrink-0 flex-row items-center gap-2">
        {props.children}
      </View>
    </SettingsItem>
  )
}

/** A labelled control. */
export function SettingsField(props: { label: string; class?: string; children?: JSX.Element }) {
  return (
    <View class={cn("gap-2", props.class)}>
      <Text class={typography.body()}>{props.label}</Text>
      {props.children}
    </View>
  )
}

export function ErrorText(props: { message: string | null | undefined; class?: string }) {
  return (
    <If when={props.message}>
      <Text class={cn(typography.body(), "text-destructive", props.class)}>{props.message}</Text>
    </If>
  )
}
