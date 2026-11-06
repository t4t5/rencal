import { Scroll, Text, View } from "nsh"
import { Sheet } from "nsh/base"

import { Button } from "@/components/ui/button"

import { cn } from "@/lib/utils"

import { CloseIcon } from "@/icons"
import { displayCase } from "@/themes"

import { PluginBadges } from "./PluginBadge"
import { createPluginAction, PluginDetails } from "./PluginDetails"
import type { PluginListItem } from "./plugin-list"

export function PluginSheet(props: {
  plugin: PluginListItem
  onClose: () => void
  onChanged: () => void
}) {
  const state = createPluginAction(() => props.plugin, props.onChanged)
  const close = () => {
    if (!state.action()) props.onClose()
  }

  return (
    <Sheet
      open
      side="right"
      backdropClass="bg-overlay"
      popupClass="w-[448px] max-w-full border-l border-border bg-background text-foreground"
      onOpenChange={(event) => {
        if (!event.open) close()
      }}
    >
      <Scroll class="min-h-0 flex-1">
        <View class="min-w-0 gap-4 p-6">
          <View class="gap-3">
            <View class="flex-row items-start justify-between gap-4">
              <Text class={cn("min-w-0 flex-1 font-mono text-lg", displayCase())}>
                {props.plugin.name}
              </Text>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={state.action() !== null}
                onPress={close}
              >
                <CloseIcon />
              </Button>
            </View>
            <PluginBadges plugin={props.plugin} />
            <If when={props.plugin.description}>
              <Text class="text-sm text-muted-foreground">{props.plugin.description}</Text>
            </If>
          </View>
          <PluginDetails plugin={props.plugin} state={state} />
        </View>
      </Scroll>
    </Sheet>
  )
}
