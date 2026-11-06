import { split } from "nsh"
import { Popover as BasePopover, type PopoverProps } from "nsh/base"

import { cn } from "@/lib/utils"

export const POPUP_SURFACE =
  "rounded-(--radius-md) border border-border bg-popover text-popover-foreground shadow-md"

/** Content anchored to `trigger`; set `popupClass` for its width and padding. */
export function Popover(props: PopoverProps) {
  const [own, rest] = split(props, ["popupClass"])
  return (
    <BasePopover
      offset={4}
      margin={8}
      {...rest}
      popupClass={cn(
        POPUP_SURFACE,
        "transition-all duration-100 ease-out",
        own.popupClass ?? "w-72 p-4",
      )}
      popupStartingClass="opacity-0 scale-95"
      popupEndingClass="opacity-0 scale-95"
    />
  )
}
