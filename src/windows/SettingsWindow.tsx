import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState } from "react"

import { NAV_ITEMS, SettingsSidebar, SettingsTab } from "@/components/settings/SettingsSidebar"
import { DragRegion } from "@/components/ui/drag-region"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"

import { useTheme } from "@/hooks/useTheme"
import { cn, isMacOS } from "@/lib/utils"

import { CloseIcon } from "@/icons/close"

export function SettingsWindow() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general")
  useTheme()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTimeout(() => {
          if (!e.defaultPrevented) {
            getCurrentWindow()
              .close()
              .catch(() => {})
          }
        }, 0)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  const activeItem = NAV_ITEMS.find((item) => item.tab === activeTab)
  if (!activeItem) return null
  const { label, page: ActivePage } = activeItem

  return (
    <div className={cn("flex h-screen", { "pt-8": isMacOS })}>
      <DragRegion className="absolute top-0 left-0 right-0 h-5!" />

      <ShortcutTooltip text="Close" shortcut="escape">
        <button
          onClick={() =>
            getCurrentWindow()
              .close()
              .catch(() => {})
          }
          className="absolute top-2 right-2 z-50 rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring"
          aria-label="Close"
        >
          <CloseIcon className="size-4" />
        </button>
      </ShortcutTooltip>

      <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <ActivePage />
    </div>
  )
}
