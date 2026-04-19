import * as React from "react"

import { cn } from "@/lib/utils"

function Input({
  className,
  ghost = true,
  type,
  ...props
}: React.ComponentProps<"input"> & { ghost?: boolean }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground h-control-height w-full min-w-0 rounded-md border bg-transparent px-3 py-1 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm ring-transparent text-sm border-transparent",
        "hover:border-input",
        "focus:border-transparent focus:bg-secondary",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        { "bg-buttonSecondaryBg border-none shadow-button-border": !ghost },
        className,
      )}
      {...props}
    />
  )
}

export { Input }
