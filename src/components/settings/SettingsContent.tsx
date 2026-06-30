import { type ReactNode } from "react"

import { cn } from "@/lib/utils"

export function SettingsContent({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("p-4 flex flex-col gap-6 grow overflow-auto", className)}>{children}</div>
  )
}
