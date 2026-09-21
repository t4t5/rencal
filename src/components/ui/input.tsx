import * as React from "react"

import { Button } from "@/components/ui/button"

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

function InputAction({
  className,
  type = "button",
  variant = "ghost",
  size = "icon-xs",
  round = true,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="input-action"
      type={type}
      variant={variant}
      size={size}
      round={round}
      className={cn(
        "absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    />
  )
}

export { Input, InputAction }
