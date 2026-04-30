import { ReactNode } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSync } from "@/contexts/SyncContext"

import { useIsOnline } from "@/hooks/useIsOnline"
import { cn } from "@/lib/utils"

import { CloudCheckIcon } from "@/icons/cloud-check"
import { CloudOffIcon } from "@/icons/cloud-off"
import { CloudWarningIcon } from "@/icons/cloud-warning"
import { SyncIcon } from "@/icons/sync"

export const SyncStatus = ({ className }: { className?: string }) => {
  const { calendars } = useCalendars()

  const { isChecking, isSyncing, syncError, pendingPreviews, syncNow } = useSync()

  const isOnline = useIsOnline()

  const pendingCount = pendingPreviews.reduce(
    (acc, p) => acc + p.to_push_count + p.to_pull_count,
    0,
  )

  const { key, content }: { key: string; content: ReactNode } = (() => {
    if (isChecking || isSyncing) {
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

    if (pendingCount > 0) {
      const calendarName = (slug: string) => calendars.find((c) => c.slug === slug)?.name ?? slug

      return {
        key: "pending",
        content: (
          <Tooltip>
            <TooltipTrigger
              onClick={() => void syncNow()}
              className="relative flex items-center cursor-pointer"
            >
              <SyncIcon className="size-4 text-muted-foreground" />
              <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] px-[3px] rounded-full bg-primary text-primary-foreground text-[10px] font-medium leading-[14px] text-center">
                {pendingCount}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              <div className="flex flex-col gap-1">
                <div className="font-medium">Click to sync</div>
                {pendingPreviews.map((p) => {
                  const parts: string[] = []
                  if (p.to_pull_count > 0) parts.push(`${p.to_pull_count} to pull`)
                  if (p.to_push_count > 0) parts.push(`${p.to_push_count} to push`)
                  return (
                    <div key={p.calendar_slug} className="text-xs text-muted-foreground">
                      {calendarName(p.calendar_slug)}: {parts.join(", ")}
                    </div>
                  )
                })}
              </div>
            </TooltipContent>
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
    <div key={key} className={cn(className)} style={{ animation: "scale-in 0.15s ease-out" }}>
      {content}
    </div>
  )
}
