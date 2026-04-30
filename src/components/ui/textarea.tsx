import * as React from "react"
import TextareaAutosizeComponent from "react-textarea-autosize"

import { cn } from "@/lib/utils"

export function Textarea({ className, ...props }: React.ComponentProps<typeof TextareaInner>) {
  return (
    <div
      role="group"
      className="group/input-group w-full border border-transparent hover:border-input h-control-height focus-within:bg-secondary focus-within:border-transparent! px-3 flex items-center rounded-md"
    >
      <TextareaInner {...props} className={cn("h-full", className)} />
    </div>
  )
}

const innerCss = "flex-1 resize-none border-0 bg-transparent outline-none! py-2 text-sm"

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
