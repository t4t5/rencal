import { ComponentProps } from "react"

import { MoreHorizIcon } from "@/icons/more-horiz"

import { Button } from "./button"

export function MoreButton(
  props: Omit<ComponentProps<typeof Button>, "children" | "asChild" | "variant" | "size">,
) {
  return (
    <Button aria-label="More options" {...props} variant="ghost" size="icon-sm">
      <MoreHorizIcon className="size-4" />
    </Button>
  )
}
