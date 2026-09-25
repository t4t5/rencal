import * as React from "react"
import TextareaAutosizeComponent from "react-textarea-autosize"

import { controlSurfaceActive } from "@/components/ui/control-surface"

import { cn } from "@/lib/utils"

export function Textarea({
  className,
  readOnly,
  disabled,
  ...props
}: React.ComponentProps<typeof TextareaInner>) {
  return (
    <div
      data-slot="textarea-wrapper"
      data-control="textarea"
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
      role="group"
      className={cn(
        "group/input-group w-full border border-transparent [&:not(:focus-within):not([data-readonly=true]):hover]:border-input min-h-control h-auto px-[var(--control-padding-inline)] flex items-center rounded-md",
        controlSurfaceActive.focusWithin,
        readOnly && "focus-within:border-transparent focus-within:bg-transparent",
      )}
    >
      <TextareaInner
        {...props}
        readOnly={readOnly}
        disabled={disabled}
        className={cn("h-full", className)}
      />
    </div>
  )
}

// One line fills exactly one control height; the 1px offsets the wrapper border.
const innerCss =
  "placeholder:text-placeholder-foreground min-w-0 flex-1 resize-none border-0 bg-transparent outline-none py-[calc((var(--control-height)-1lh)/2-1px)] text-sm"

export function TextareaInner({
  autosize = true,
  style,
  className,
  readOnly,
  // Read-only text renders as static text, so it isn't a Tab stop either.
  tabIndex = readOnly ? -1 : undefined,
  ...props
}: React.ComponentProps<"textarea"> & { autosize?: boolean }) {
  if (autosize) {
    return (
      <TextareaAutosizeComponent
        data-slot="textarea"
        className={cn(innerCss, "overflow-hidden", className)}
        readOnly={readOnly}
        tabIndex={tabIndex}
        {...props}
      />
    )
  } else {
    return (
      <textarea
        data-slot="textarea"
        style={style}
        className={cn(innerCss, className)}
        readOnly={readOnly}
        tabIndex={tabIndex}
        {...props}
      />
    )
  }
}
