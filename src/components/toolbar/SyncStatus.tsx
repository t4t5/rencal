import { type ReactNode, useState } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { SyncPreview } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"
import { useSync } from "@/contexts/SyncContext"

import { useIsOnline } from "@/hooks/useIsOnline"

import { CloudIcon } from "@/icons/cloud"
import { CloudOffIcon } from "@/icons/cloud-off"
import { CloudWarningIcon } from "@/icons/cloud-warning"
import { SyncIcon as SyncingIcon } from "@/icons/sync"

import { Button } from "../ui/button"

export const SyncStatus = () => {
  const { isChecking, isSyncing, syncError, pendingPreviews, syncNow } = useSync()
  const [isForcingSync, setIsForcingSync] = useState(false)

  const isOnline = useIsOnline()

  const pendingCount = pendingPreviews.reduce(
    (acc, p) => acc + p.to_push_count + p.to_pull_count,
    0,
  )

  let icon = (
    <CloudIcon
      className="size-5 text-muted-foreground pointer-events-none"
      isLoading={isChecking}
    />
  )

  let tooltipContent: ReactNode = <>Up-to-date</>

  if (isChecking) {
    tooltipContent = <>Checking for changes...</>
  }

  if (pendingCount) {
    tooltipContent = <ChangesPreview pendingPreviews={pendingPreviews} />
  }

  if (isSyncing || isForcingSync) {
    icon = <SyncingIcon className="size-4 text-muted-foreground animate-spin pointer-events-none" />
    tooltipContent = <>Syncing...</>
  }

  if (syncError) {
    icon = <CloudWarningIcon className="size-4 text-warning pointer-events-none" />
    tooltipContent = syncError
  }

  if (!isOnline) {
    icon = <CloudOffIcon className="size-4 text-error pointer-events-none" />
    tooltipContent = <>No internet connection</>
  }

  const handleSyncNow = async () => {
    setIsForcingSync(true)
    try {
      await syncNow()
    } finally {
      setIsForcingSync(false)
    }
  }

  const button = (
    <Button
      variant="ghost"
      size="icon"
      tabIndex={-1}
      className="relative focus-visible:ring-0"
      onClick={pendingCount ? () => void handleSyncNow() : undefined}
    >
      <div style={{ animation: "scale-in 0.15s ease-out" }}>{icon}</div>

      {!!pendingCount && <DiffCounterBadge count={pendingCount} />}
    </Button>
  )

  if (!tooltipContent) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild tabIndex={-1}>
        {button}
      </TooltipTrigger>
      <TooltipContent className="max-w-64 wrap-break-word">{tooltipContent}</TooltipContent>
    </Tooltip>
  )
}

const DiffCounterBadge = ({ count }: { count: number }) => {
  const { autoSyncEnabled } = useSettings()

  if (autoSyncEnabled) return null

  return (
    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-primary text-primary-foreground text-[10px] font-medium leading-[14px] text-center">
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
