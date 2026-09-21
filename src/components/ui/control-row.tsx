import { Slot } from "@radix-ui/react-slot"
import * as React from "react"

import { cn } from "@/lib/utils"

function ControlRow({
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div"

  return <Comp data-control-layout="row" className={cn("control-row", className)} {...props} />
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
