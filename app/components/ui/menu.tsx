import { type JSX, split, Text } from "nsh"
import {
  ContextMenu as BaseContextMenu,
  type ContextMenuProps,
  Menu as BaseMenu,
  MenuItem as BaseMenuItem,
  type MenuProps,
  MenuSeparator as BaseMenuSeparator,
} from "nsh/base"

import { cn } from "@/lib/utils"

import { POPUP_SURFACE } from "./popover"

const POPUP = cn(POPUP_SURFACE, "min-w-32 p-1 transition-all duration-100 ease-out")
const STARTING = "opacity-0 scale-95"

/** A dropdown of `MenuItem`s opened by `trigger`. */
export function Menu(props: MenuProps) {
  const [own, rest] = split(props, ["popupClass"])
  return (
    <BaseMenu
      offset={4}
      margin={8}
      {...rest}
      popupClass={cn(POPUP, own.popupClass)}
      popupStartingClass={STARTING}
      popupEndingClass={STARTING}
    />
  )
}

/** A menu that the secondary button opens on `trigger`. */
export function ContextMenu(props: ContextMenuProps) {
  const [own, rest] = split(props, ["popupClass"])
  return (
    <BaseContextMenu
      margin={8}
      {...rest}
      popupClass={cn(POPUP, own.popupClass)}
      popupStartingClass={STARTING}
      popupEndingClass={STARTING}
    />
  )
}

export function MenuItem(props: {
  label?: string
  destructive?: boolean
  disabled?: boolean
  checked?: boolean
  closeOnSelect?: boolean
  class?: string
  onSelect?: () => void
  children?: JSX.Element
}) {
  return (
    <BaseMenuItem
      disabled={props.disabled}
      checked={props.checked}
      closeOnSelect={props.closeOnSelect}
      onSelect={props.onSelect}
      class={cn(
        "flex-row items-center gap-2 rounded-(--radius-sm) px-2 py-1.5 hover:bg-accent focus:bg-accent disabled:opacity-50",
        props.class,
      )}
    >
      <If when={props.label}>
        <Text class={cn("text-sm", props.destructive && "text-destructive")}>{props.label}</Text>
      </If>
      {props.children}
    </BaseMenuItem>
  )
}

export function MenuSeparator() {
  return <BaseMenuSeparator class="-mx-1 my-1 h-px bg-border" />
}
