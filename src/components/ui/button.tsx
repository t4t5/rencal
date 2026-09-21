import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium button transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary-hover shadow-button-border",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20",
        input:
          "bg-transparent border border-transparent hover:border-input data-[state=open]:bg-secondary data-[state=open]:border-transparent",
        ghost: "hover:bg-hover hover:text-accent-foreground",
      },
      size: {
        default: "h-control px-3 has-[>svg]:px-3",
        sm: "h-control-sm rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-control-lg rounded-md px-6 has-[>svg]:px-4",
        icon: "size-control p-0",
        "icon-xs": "size-6 p-0",
        "icon-sm": "size-7 p-0",
        "icon-md": "size-8 p-0",
        "icon-lg": "size-9 p-0",
      },
      round: {
        true: "rounded-circle",
        false: "rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant,
  size,
  round,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, round, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
