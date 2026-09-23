import * as React from "react"

import { cn } from "@/lib/utils"

// The accent variant is a removable list entry (a reminder, a conference link)
// that takes the accent highlight while hovered or focused.
function Item({
  variant = "default",
  className,
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "accent" }) {
  return (
    <div
      data-slot="item"
      data-variant={variant}
      className={cn(
        "control-row",
        variant === "accent" &&
          "group h-control rounded-md border border-transparent text-sm hover:bg-accent hover:text-accent-foreground focus-within:bg-accent focus-within:text-accent-foreground",
        className,
      )}
      {...props}
    />
  )
}

function ItemMedia({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="item-media" className={cn("control-leading", className)} {...props} />
}

function ItemContent({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="item-content" className={cn("control-content", className)} {...props} />
}

function ItemActions({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="item-actions" className={cn("control-trailing", className)} {...props} />
}

export { Item, ItemActions, ItemContent, ItemMedia }
