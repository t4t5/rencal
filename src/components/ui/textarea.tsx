import * as React from "react"
import TextareaAutosizeComponent from "react-textarea-autosize"

import { cn } from "@/lib/utils"

export function Textarea({ className, ...props }: React.ComponentProps<typeof TextareaInner>) {
  return (
    <div className="border hover:border-input h-control-height">
      <TextareaInner {...props} />
    </div>
  )
}

const innerCss = "flex-1 resize-none border-0 bg-transparent outline-none! py-2"

export function TextareaInner({
  autosize = true,
  style,
  className,
  ...props
}: React.ComponentProps<"textarea"> & { autosize?: boolean }) {
  if (autosize) {
    return (
      <TextareaAutosizeComponent
        data-slot="textarea"
        className={cn(innerCss, className)}
        {...props}
      />
    )
  } else {
    return (
      <textarea data-slot="textarea" style={style} className={cn(innerCss, className)} {...props} />
    )
  }
}
