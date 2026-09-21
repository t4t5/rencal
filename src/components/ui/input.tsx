import * as React from "react"

import { cn } from "@/lib/utils"

function Input({
  className,
  variant = "ghost",
  type,
  ...props
}: React.ComponentProps<"input"> & { variant?: "ghost" | "default" }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "placeholder:text-muted-foreground h-control w-full min-w-0 rounded-md border bg-transparent px-2 outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 ring-transparent text-sm border-transparent",
        "hover:border-input",
        "focus:border-transparent focus:bg-secondary",
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        { "bg-secondary border-none shadow-button-border": variant === "default" },
        className,
      )}
      {...props}
    />
  )
}

export { Input }
