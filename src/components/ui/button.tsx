import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary-hover shadow-button-border",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover focus-visible:ring-destructive/20",
        outline: "bg-background shadow-input-border hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-control px-3 has-[>svg]:px-3",
        xs: "h-(--control-icon-size) gap-1 px-2 has-[>svg]:px-1.5",
        sm: "h-control-sm gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-control-lg px-6 has-[>svg]:px-4",
        icon: "size-control p-0",
        "icon-xs": "size-(--control-icon-size) p-0",
        "icon-sm": "size-control-sm p-0",
        "icon-lg": "size-control-lg p-0",
      },
      round: {
        true: "rounded-circle",
        false: "rounded-md",
      },
      typography: {
        button: "font-medium",
        field: "font-normal",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      typography: "button",
    },
  },
)

function Button({
  className,
  variant,
  size,
  round,
  typography,
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
      data-button=""
      data-variant={variant ?? "default"}
      data-size={size ?? "default"}
      data-typography={typography ?? "button"}
      className={cn(buttonVariants({ variant, size, round, typography, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
