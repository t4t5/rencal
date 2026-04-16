import { ReactNode, useEffect, useState } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { useSync } from "@/contexts/SyncContext"

import { CloudCheckIcon } from "@/icons/cloud-check"
import { CloudOffIcon } from "@/icons/cloud-off"
import { CloudWarningIcon } from "@/icons/cloud-warning"
import { SyncIcon } from "@/icons/sync"

export const SyncStatus = () => {
  const { isSyncing, syncError } = useSync()
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const { key, content }: { key: string; content: ReactNode } = (() => {
    if (isSyncing) {
      return {
        key: "syncing",
        content: <SyncIcon className="size-4 text-muted-foreground animate-spin" />,
      }
    }

    if (!isOnline) {
      return {
        key: "offline",
        content: (
          <Tooltip>
            <TooltipTrigger className="flex items-center">
              <CloudOffIcon className="size-4 text-error" />
            </TooltipTrigger>
            <TooltipContent>No internet connection</TooltipContent>
          </Tooltip>
        ),
      }
    }

    if (syncError) {
      return {
        key: "error",
        content: (
          <Tooltip>
            <TooltipTrigger className="flex items-center">
              <CloudWarningIcon className="size-4 text-warning" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 wrap-break-word">{syncError}</TooltipContent>
          </Tooltip>
        ),
      }
    }

    return {
      key: "success",
      content: <CloudCheckIcon className="size-4 text-muted-foreground" />,
    }
  })()

  return (
    <div key={key} style={{ animation: "scale-in 0.15s ease-out" }}>
      {content}
    </div>
  )
}
