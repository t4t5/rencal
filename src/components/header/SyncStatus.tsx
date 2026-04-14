import { AiOutlineSync as SyncIcon } from "react-icons/ai"
import { PiWarningCircle as WarningIcon } from "react-icons/pi"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { useSync } from "@/contexts/SyncContext"

import { cn } from "@/lib/utils"

export const SyncStatus = () => {
  const { isSyncing, syncError } = useSync()

  if (syncError) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <WarningIcon className="text-destructive" />
        </TooltipTrigger>
        <TooltipContent className="max-w-64 wrap-break-word">{syncError}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <SyncIcon
      className={cn("text-muted-foreground opacity-0 transition-opacity", {
        "animate-spin text-primary opacity-100": isSyncing,
      })}
    />
  )
}
