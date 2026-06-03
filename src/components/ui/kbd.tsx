import * as React from "react"

import { cn } from "@/lib/utils"

function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "bg-hover text-muted-foreground pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm px-1 text-xs font-medium select-none [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
