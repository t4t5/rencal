import { LayoutAnimation, View } from "nsh"

import { Button } from "@/components/ui/button"
import { Tooltip } from "@/components/ui/tooltip"

import { cn } from "@/lib/utils"

import { PlusIcon } from "@/icons"
import { isDrafting, startDrafting, stopDrafting } from "@/stores/draft"

import { ComposeEventInput } from "./ComposeEventInput"
import { isFlying } from "./FlyAnimation"

/** The "+": pressed, it grows into the natural-language input. */
export function ComposeEventButton() {
  const expanded = () => isDrafting() || isFlying()
  const animated = (change: () => void) => {
    LayoutAnimation.easeInEaseOut()
    change()
  }

  return (
    <View class={cn("flex-row justify-end", expanded() ? "w-full" : "w-(--control-height)")}>
      <If
        when={expanded()}
        else={
          <View tooltip={<Tooltip label="Create new event" placement="bottom" />}>
            <Button
              variant="secondary"
              size="icon"
              testID="compose-event"
              accessibilityLabel="Create new event"
              onPress={() => animated(startDrafting)}
            >
              <PlusIcon />
            </Button>
          </View>
        }
      >
        <ComposeEventInput onExit={() => animated(stopDrafting)} />
      </If>
    </View>
  )
}
