import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window"
import { AiOutlineSync as SyncIcon } from "react-icons/ai"
import { HiOutlineCog6Tooth as SettingsIcon } from "react-icons/hi2"
import { PiWarningCircle as WarningIcon } from "react-icons/pi"

import { SearchButton } from "@/components/search/SearchButton"
import { Button } from "@/components/ui/button"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { useSync } from "@/contexts/SyncContext"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { cn, isMacOS } from "@/lib/utils"

import { AddEventButton } from "./AddEventButton"
import { InvitesDropdown } from "./InvitesDropdown"

export async function openSettingsWindow() {
  const existing = await WebviewWindow.getByLabel("settings")
  if (existing) {
    await existing.setFocus()
    return
  }

  const width = 700
  const height = 500
  const monitor = await currentMonitor()
  const scale = monitor?.scaleFactor ?? 1
  const screenW = (monitor?.size.width ?? width) / scale
  const screenH = (monitor?.size.height ?? height) / scale

  new WebviewWindow("settings", {
    url: "/?view=settings",
    title: "Settings",
    titleBarStyle: "overlay",
    width,
    height,
    decorations: isMacOS,
    x: Math.round((screenW - width) / 2),
    y: Math.round((screenH - height) / 2),
    parent: getCurrentWindow(),
  })
}

export function ActionBar() {
  const isMd = useBreakpoint("md")

  return (
    <div
      className={cn("flex justify-between items-center gap-3", {
        "pl-[78px]": isMacOS,
      })}
    >
      <AddEventButton />

      {!isMd && (
        <div className="flex gap-2 items-center">
          <SyncStatus />
          <InvitesDropdown />
          <SettingsButton />
          <SearchButton />
        </div>
      )}
    </div>
  )
}

export const SettingsButton = () => {
  return (
    <ShortcutTooltip text="Settings" shortcut="mod+comma">
      <Button variant="ghost" onClick={() => openSettingsWindow()}>
        <SettingsIcon />
      </Button>
    </ShortcutTooltip>
  )
}

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
