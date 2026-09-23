import { Slot } from "@radix-ui/react-slot"
import * as React from "react"

import { cn } from "@/lib/utils"

// The item variant is a removable list entry (a reminder, a conference link)
// that takes the accent highlight while hovered or focused.
function ControlRow({
  asChild = false,
  variant,
  className,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean; variant?: "item" }) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-control-layout="row"
      data-variant={variant}
      className={cn(
        "control-row",
        variant === "item" &&
          "group h-control rounded-md border border-transparent text-sm hover:bg-accent hover:text-accent-foreground focus-within:bg-accent focus-within:text-accent-foreground",
        className,
      )}
      {...props}
    />
  )
}

function ControlLeading({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="control-leading"
      data-control-part="leading"
      className={cn("control-leading", className)}
      {...props}
    />
  )
}

function ControlContent({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="control-content"
      data-control-part="content"
      className={cn("control-content", className)}
      {...props}
    />
  )
}

function ControlTrailing({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="control-trailing"
      data-control-part="trailing"
      className={cn("control-trailing", className)}
      {...props}
    />
  )
}

export { ControlContent, ControlLeading, ControlRow, ControlTrailing }
