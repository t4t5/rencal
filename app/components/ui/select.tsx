import { type JSX, split, Text, token, View } from "nsh"
import { Select as BaseSelect, type SelectEntry, type SelectProps } from "nsh/base"

import { cn } from "@/lib/utils"

import { CheckIcon, ChevronDownIcon } from "@/icons"

import { POPUP_SURFACE } from "./popover"

export const LIST_ROW =
  "group rounded-(--radius-sm) focus:bg-accent focus:text-accent-foreground disabled:opacity-50"
export const SELECT_POPUP = cn(POPUP_SURFACE, "max-h-80 p-1")
export const SELECT_GROUP = "px-2 pb-1 pt-2 text-xs text-muted-foreground"

/** A row with the check at its end; pass `leading` for a dot or icon before the title. */
export function SelectRow(props: { item: SelectEntry; leading?: JSX.Element }) {
  return (
    <View class="flex-row items-center gap-2 py-1.5 pl-2 pr-2">
      {props.leading}
      <Text class="flex-1 truncate text-sm">{props.item.title}</Text>
      <CheckIcon class="size-4 opacity-0 group-selected:opacity-100" />
    </View>
  )
}

/** What a select shows on its trigger: the look shared by selects, menus and pickers. */
export function SelectTrigger(props: {
  variant?: "ghost" | "default"
  class?: string
  disabled?: boolean
  children?: JSX.Element
}) {
  return (
    <View
      class={cn(
        "group h-(--control-height) flex-row items-center justify-between gap-2 rounded-(--radius-md) border px-2",
        "border-transparent hover:border-input aria-expanded:border-transparent aria-expanded:bg-secondary focus-visible:bg-secondary disabled:opacity-50",
        props.variant === "default" && "border-border",
        props.class,
      )}
    >
      {props.children}
      <ChevronDownIcon
        class={cn(
          "size-3 shrink-0 opacity-0 group-hover:opacity-100 group-aria-expanded:opacity-100",
          props.variant === "default" && "opacity-100",
        )}
        color={token("muted-foreground")}
      />
    </View>
  )
}

type Props = Omit<SelectProps, "onChange" | "trigger" | "renderItem"> & {
  onChange?: (value: string | null) => void
  placeholder?: string
  variant?: "ghost" | "default"
  triggerClass?: string
  /** What the trigger shows; the chosen item's title otherwise. */
  label?: JSX.Element
  /** Before a row's title. */
  leading?: (item: SelectEntry) => JSX.Element
  renderItem?: SelectProps["renderItem"]
}

/** One value out of `items`, with the look of the old select field. */
export function Select(props: Props) {
  const [own, rest] = split(props, [
    "onChange",
    "placeholder",
    "variant",
    "triggerClass",
    "label",
    "leading",
    "renderItem",
    "popupClass",
    "itemClass",
    "groupClass",
    "searchClass",
  ])
  const title = () => props.items?.find((item) => item.value === props.value)?.title
  return (
    <BaseSelect
      offset={4}
      margin={8}
      {...rest}
      onChange={({ value }) => own.onChange?.(value)}
      popupClass={cn(SELECT_POPUP, own.popupClass)}
      itemClass={cn(LIST_ROW, own.itemClass)}
      groupClass={cn(SELECT_GROUP, own.groupClass)}
      searchClass={cn(
        "mx-1 mb-1 rounded-(--radius-sm) border border-input px-2 py-1.5 text-sm text-foreground placeholder:text-placeholder-foreground",
        own.searchClass,
      )}
      renderItem={
        own.renderItem ?? ((item) => <SelectRow item={item} leading={own.leading?.(item)} />)
      }
      trigger={
        <SelectTrigger variant={own.variant} class={own.triggerClass}>
          {own.label ?? (
            <Text class={cn("truncate text-sm", !title() && "text-placeholder-foreground")}>
              {title() ?? own.placeholder ?? ""}
            </Text>
          )}
        </SelectTrigger>
      }
    />
  )
}
