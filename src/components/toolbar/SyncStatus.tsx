import { ReactNode } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { SyncPreview } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"
import { useSync } from "@/contexts/SyncContext"

import { useIsOnline } from "@/hooks/useIsOnline"

import { CloudCheckIcon } from "@/icons/cloud-check"
import { CloudOffIcon } from "@/icons/cloud-off"
import { CloudWarningIcon } from "@/icons/cloud-warning"
import { SyncIcon as SyncingIcon } from "@/icons/sync"

export const SyncStatus = () => {
  const { isChecking, isSyncing, syncError, pendingPreviews, syncNow } = useSync()

  const isOnline = useIsOnline()

  const pendingCount = pendingPreviews.reduce(
    (acc, p) => acc + p.to_push_count + p.to_pull_count,
    0,
  )

  const StatusIcon = (): ReactNode => {
    if (isChecking || isSyncing) {
      return (
        <div className="relative">
          <SyncingIcon className="size-4 text-muted-foreground animate-spin" />
          {!!pendingCount && <BadgeCount count={pendingCount} />}
        </div>
      )
    }

    if (!isOnline) {
      return (
        <Tooltip>
          <TooltipTrigger className="flex items-center">
            <CloudOffIcon className="size-4 text-error" />
          </TooltipTrigger>
          <TooltipContent>No internet connection</TooltipContent>
        </Tooltip>
      )
    }

    if (syncError) {
      return (
        <Tooltip>
          <TooltipTrigger className="flex items-center">
            <CloudWarningIcon className="size-4 text-warning" />
          </TooltipTrigger>
          <TooltipContent className="max-w-64 wrap-break-word">{syncError}</TooltipContent>
        </Tooltip>
      )
    }

    if (pendingCount > 0) {
      return (
        <Tooltip>
          <TooltipTrigger
            onClick={() => void syncNow()}
            className="relative flex items-center cursor-pointer"
          >
            <SyncingIcon className="size-4 text-muted-foreground" />
            <BadgeCount count={pendingCount} />
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            <ChangesPreview pendingPreviews={pendingPreviews} />
          </TooltipContent>
        </Tooltip>
      )
    }

    return <CloudCheckIcon className="size-4 text-muted-foreground" />
  }

  return (
    <div style={{ animation: "scale-in 0.15s ease-out" }}>
      <StatusIcon />
    </div>
  )
}

const BadgeCount = ({ count }: { count: number }) => {
  const { autoSyncEnabled } = useSettings()

  if (autoSyncEnabled) return null

  return (
    <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] px-[3px] rounded-full bg-primary text-primary-foreground text-[10px] font-medium leading-[14px] text-center">
      {count}
    </span>
  )
}

const ChangesPreview = ({ pendingPreviews }: { pendingPreviews: SyncPreview[] }) => {
  const { calendars } = useCalendars()
  const calendarName = (slug: string) => calendars.find((c) => c.slug === slug)?.name ?? slug

  const { autoSyncEnabled } = useSettings()
  if (autoSyncEnabled) return null

  return (
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
  )
}
