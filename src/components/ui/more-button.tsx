import { ComponentProps } from "react"

import { MoreHorizIcon } from "@/icons/more-horiz"

import { Button } from "./button"

export function MoreButton(
  props: Omit<ComponentProps<typeof Button>, "children" | "asChild" | "variant">,
) {
  return (
    <Button aria-label="More options" size="icon-xs" {...props} variant="ghost">
      <MoreHorizIcon className="size-4" />
    </Button>
  )
}
