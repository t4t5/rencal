import { split, Text } from "nsh"
import { Combobox as BaseCombobox, type ComboboxProps } from "nsh/base"

import { cn } from "@/lib/utils"

import { LIST_ROW, SELECT_GROUP, SELECT_POPUP } from "./select"

/** A field that filters a list by what's typed; `class` is the field's box. */
export function Combobox(props: ComboboxProps & { variant?: "ghost" | "default" }) {
  const [own, rest] = split(props, ["class", "variant", "popupClass", "itemClass", "inputClass"])
  return (
    <BaseCombobox
      offset={4}
      margin={8}
      empty={
        <Text class="px-2 py-6 text-center text-sm text-muted-foreground">No results found.</Text>
      }
      {...rest}
      class={cn(
        "h-(--control-height) w-full flex-row items-center gap-2 rounded-(--radius-md) border px-2",
        "border-transparent hover:border-input focus-within:border-transparent focus-within:bg-secondary",
        own.variant === "default" && "border-border",
        own.class,
      )}
      inputClass={cn(
        "min-w-0 flex-1 text-sm text-foreground placeholder:text-placeholder-foreground",
        own.inputClass,
      )}
      popupClass={cn(SELECT_POPUP, own.popupClass)}
      itemClass={cn(LIST_ROW, own.itemClass)}
      groupClass={SELECT_GROUP}
    />
  )
}
