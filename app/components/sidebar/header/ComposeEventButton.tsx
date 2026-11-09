import { LayoutAnimation, View } from "nsh"

import { Button } from "@/components/ui/button"
import { Tooltip } from "@/components/ui/tooltip"

import { cn } from "@/lib/utils"

import { PlusIcon } from "@/icons"
import { COMPOSE_ANIMATION, isDrafting, startDrafting, stopDrafting } from "@/stores/draft"

import { ComposeEventInput } from "./ComposeEventInput"
import { isFlying } from "./FlyAnimation"

/**
 * The "+": pressed, it grows into the natural-language input. The input is always
 * there, under the button, so opening and closing are the same resize.
 */
export function ComposeEventButton() {
  const expanded = () => isDrafting() || isFlying()
  const exit = () => {
    LayoutAnimation.configureNext(COMPOSE_ANIMATION)
    stopDrafting()
  }

  return (
    <View class={cn("relative", expanded() ? "w-full" : "w-(--control-height)")}>
      <ComposeEventInput onExit={exit} />
      <If when={!expanded()}>
        <View
          class="absolute inset-0"
          tooltip={<Tooltip label="Create new event" placement="bottom" />}
        >
          <Button
            variant="secondary"
            size="icon"
            class="w-full"
            testID="compose-event"
            accessibilityLabel="Create new event"
            onPress={startDrafting}
          >
            <PlusIcon />
          </Button>
        </View>
      </If>
    </View>
  )
}
