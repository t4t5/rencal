import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function PluginBadge({ solid, children }: { solid?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-xs border px-1.5 py-0.5 text-xs",
        solid
          ? "border-transparent bg-secondary text-secondary-foreground shadow-button-border"
          : "border-border text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}
