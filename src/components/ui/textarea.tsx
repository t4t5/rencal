import * as React from "react"
import TextareaAutosizeComponent from "react-textarea-autosize"

import { cn } from "@/lib/utils"

const textareaStyles =
  "border-transparent placeholder:text-muted-foreground aria-invalid:border-destructive flex field-sizing-content min-h-0 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none ring-transparent disabled:cursor-not-allowed disabled:opacity-50 focus:bg-secondary hover:border-input focus:border-transparent resize-none"

function Textarea({
  autosize = true,
  style,
  className,
  ...props
}: React.ComponentProps<"textarea"> & { autosize?: boolean }) {
  if (autosize) {
    return (
      <TextareaAutosizeComponent
        data-slot="textarea"
        className={cn(textareaStyles, className)}
        {...props}
      />
    )
  } else {
    return (
      <textarea
        data-slot="textarea"
        style={style}
        className={cn(textareaStyles, className)}
        {...props}
      />
    )
  }
}

export { Textarea }
