import { type JSX, Text, View } from "nsh"

import { cn } from "@/lib/utils"

import { CONTRIBUTION_LABELS, type PluginListItem } from "./plugin-list"

const VARIANTS = {
  outline: { box: "border-border", text: "text-muted-foreground" },
  solid: { box: "border-transparent bg-secondary", text: "text-secondary-foreground" },
  // Themes check --success as text, but pair no foreground with it as a fill.
  success: { box: "border-success/50 bg-success/10", text: "text-success" },
}

export function PluginBadge(props: { variant?: keyof typeof VARIANTS; children?: JSX.Element }) {
  const look = () => VARIANTS[props.variant ?? "outline"]
  return (
    <View class={cn("shrink-0 rounded-(--radius-xs) border px-1.5 py-0.5", look().box)}>
      <Text class={cn("text-xs", look().text)}>{props.children}</Text>
    </View>
  )
}

export function PluginBadges(props: { plugin: PluginListItem }) {
  return (
    <If when={props.plugin.contributions.length > 0 || props.plugin.installed}>
      <View class="flex-row flex-wrap gap-1.5">
        <Each of={props.plugin.contributions}>
          {(kind) => <PluginBadge>{CONTRIBUTION_LABELS[kind()]}</PluginBadge>}
        </Each>
        <If
          when={props.plugin.installed?.update_version}
          else={
            <If when={props.plugin.installed}>
              <PluginBadge variant="solid">Installed</PluginBadge>
            </If>
          }
        >
          <PluginBadge variant="success">Update available</PluginBadge>
        </If>
      </View>
    </If>
  )
}
