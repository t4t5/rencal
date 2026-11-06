import { type JSX, View } from "nsh"

import { Menu } from "@/components/ui/menu"

import { cn } from "@/lib/utils"

import { MoreHorizIcon } from "@/icons"

/** The "..." button of a row and what it opens. */
export function MoreMenu(props: { class?: string; children?: JSX.Element }) {
  return (
    <Menu
      align="end"
      trigger={
        <View
          accessibilityLabel="More options"
          class={cn(
            "size-(--control-height-xs) items-center justify-center rounded-(--radius-md) hover:bg-accent",
            props.class,
          )}
        >
          <MoreHorizIcon class="size-4" />
        </View>
      }
    >
      {props.children}
    </Menu>
  )
}
