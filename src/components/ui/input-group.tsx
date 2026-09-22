import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { controlSurfaceActive } from "@/components/ui/control-surface"
import { InputInner } from "@/components/ui/input"
import { TextareaInner } from "@/components/ui/textarea"

import { cn } from "@/lib/utils"

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      data-control-layout="row"
      role="group"
      className={cn(
        "control-row group/input-group border-transparent [&:not(:focus-within):not([data-readonly=true]):hover]:border-input relative flex w-full items-center rounded-md border transition-[color,box-shadow] outline-none",
        "min-h-control min-w-0",

        // Focus state.
        controlSurfaceActive.focusWithin,

        "data-[readonly=true]:focus-within:border-transparent data-[readonly=true]:focus-within:bg-transparent",

        // Error state.
        "has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[[data-slot][aria-invalid=true]]:border-destructive",

        "has-disabled:pointer-events-none",

        className,
      )}
      {...props}
    />
  )
}

function InputGroupAddon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group-addon"
      data-control-part="leading"
      className={cn(
        "control-leading h-auto cursor-text gap-2 text-sm font-medium select-none [&>svg:not([class*='size-'])]:size-4 [&>kbd]:rounded-[calc(var(--radius)-5px)] group-data-[disabled=true]/input-group:opacity-50",
        className,
      )}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          return
        }
        e.currentTarget.parentElement
          ?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea")
          ?.focus()
      }}
      {...props}
    />
  )
}

const inputGroupButtonVariants = cva("text-sm shadow-none flex gap-2 items-center", {
  variants: {
    size: {
      xs: "h-6 gap-1 px-2 rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-3.5 has-[>svg]:px-2",
      sm: "h-8 px-2.5 gap-1.5 rounded-md has-[>svg]:px-2.5",
      "icon-xs": "size-6 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0",
      "icon-sm": "size-8 p-0 has-[>svg]:p-0",
    },
  },
  defaultVariants: {
    size: "xs",
  },
})

function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size"> &
  VariantProps<typeof inputGroupButtonVariants>) {
  return (
    <Button
      type={type}
      data-size={size}
      data-control-part="trailing"
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-control-part="content"
      className={cn(
        "text-muted-foreground flex items-center gap-2 text-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function InputGroupInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <InputInner
      data-slot="input-group-control"
      data-control-part="content"
      className={cn("h-auto min-h-0 flex-1 border-0 px-0 shadow-none", className)}
      {...props}
    />
  )
}

function InputGroupTextarea({
  autosize = true,
  className,
  ...props
}: React.ComponentProps<"textarea"> & { autosize?: boolean }) {
  return (
    <TextareaInner
      data-slot="input-group-control"
      data-control-part="content"
      autosize={autosize}
      className={className}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}
