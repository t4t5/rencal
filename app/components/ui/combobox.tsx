import type { ViewRef } from "nsh"
import { cleanup, Keyboard, signal, split, Text } from "nsh"
import { Combobox as BaseCombobox, type ComboboxProps } from "nsh/base"
import { FocusWatch } from "rencal/native"

import { BlurOnPressOutside } from "@/components/ui/blur-on-press-outside"

import { cn } from "@/lib/utils"

import { typography } from "@/themes"

import { LIST_ROW, SELECT_POPUP, selectGroupClass } from "./select"

/** Long enough for a press that focused another field to report it. */
const FOCUS_SETTLE_MS = 50

type OpenChange = Parameters<NonNullable<ComboboxProps["onOpenChange"]>>[0]

/** A field that filters a list by what's typed; `class` is the field's box. */
export function Combobox(props: ComboboxProps & { variant?: "ghost" | "default" }) {
  const [own, rest] = split(props, [
    "class",
    "variant",
    "popupClass",
    "itemClass",
    "inputClass",
    "open",
    "defaultOpen",
    "onOpenChange",
  ])
  const ownOpen = signal(own.defaultOpen ?? false)
  const isOpen = () => own.open ?? ownOpen()
  const setOpen = (event: OpenChange) => {
    ownOpen.set(event.open)
    own.onOpenChange?.(event)
    // The list's own press outside closes it; the field should let go too.
    if (event.reason === "pressOutside") blur()
  }
  const field = signal<ViewRef | undefined>(undefined)
  const focused = signal(false)
  // The input is the base's, with no ref to blur, and `Keyboard.dismiss()`
  // unfocuses whichever input has the focus: once the press has had time to
  // focus another field (`onFocusOut`), it isn't ours to drop.
  let settling: ReturnType<typeof setTimeout> | undefined
  const blur = () => {
    clearTimeout(settling)
    settling = setTimeout(() => {
      if (focused()) Keyboard.dismiss()
    }, FOCUS_SETTLE_MS)
  }
  cleanup(() => clearTimeout(settling))
  return (
    <FocusWatch onFocusIn={() => focused.set(true)} onFocusOut={() => focused.set(false)}>
      <BaseCombobox
        ref={(ref) => field.set(ref)}
        offset={4}
        margin={8}
        empty={
          <Text class={cn(typography.body(), "px-2 py-6 text-center text-muted-foreground")}>
            No results found.
          </Text>
        }
        {...rest}
        open={isOpen()}
        onOpenChange={setOpen}
        class={cn(
          "h-(--control-height) w-full flex-row items-center gap-2 rounded-(--radius-md) border px-2",
          "border-transparent hover:border-input focus-within:border-transparent focus-within:hover:border-transparent focus-within:bg-secondary",
          own.variant === "default" && "border-border",
          own.class,
        )}
        inputClass={cn(
          typography.body(),
          "min-w-0 flex-1 text-foreground placeholder:text-placeholder-foreground",
          own.inputClass,
        )}
        popupClass={cn(SELECT_POPUP, own.popupClass)}
        itemClass={cn(LIST_ROW, own.itemClass)}
        groupClass={selectGroupClass()}
      />
      {/* While open, a press on a row is outside too; the list handles those. */}
      <BlurOnPressOutside when={focused() && !isOpen()} anchor={field()} blur={blur} />
    </FocusWatch>
  )
}
