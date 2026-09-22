import * as React from "react"

import { Button } from "@/components/ui/button"
import { controlSurfaceActive } from "@/components/ui/control-surface"

import { cn } from "@/lib/utils"

const inputContentCss =
  "placeholder:text-placeholder-foreground min-w-0 bg-transparent text-sm outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"

function Input({
  className,
  variant = "ghost",
  type,
  ...props
}: React.ComponentProps<"input"> & { variant?: "ghost" | "default" }) {
  return (
    <InputInner
      type={type}
      data-control-surface=""
      className={cn(
        "h-control w-full rounded-md border px-2 ring-transparent border-transparent",
        "hover:border-input",
        controlSurfaceActive.focus,
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        { "bg-secondary border-none shadow-button-border": variant === "default" },
        className,
      )}
      {...props}
    />
  )
}

// Text-input behavior without surface geometry. Composite controls use this so
// their outer wrapper remains the only element that owns height and borders.
function InputInner({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input type={type} data-slot="input" className={cn(inputContentCss, className)} {...props} />
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

export { Input, InputAction, InputInner }
