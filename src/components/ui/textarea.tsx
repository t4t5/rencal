import * as React from "react"
import TextareaAutosizeComponent from "react-textarea-autosize"

import { cn } from "@/lib/utils"

const textareaStyles =
  "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-0 h-9 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"

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
