import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState } from "react"

import { NAV_ITEMS, SettingsSidebar, SettingsTab } from "@/components/settings/SettingsSidebar"
import { DragRegion } from "@/components/ui/drag-region"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"
import { Tabs, TabsContent } from "@/components/ui/tabs"

import { useTheme } from "@/hooks/useTheme"
import { api } from "@/lib/api"
import { cn, isMacOS } from "@/lib/utils"

import { CloseIcon } from "@/icons/close"

export function SettingsWindow() {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const requested = new URLSearchParams(window.location.search).get("tab")
    return NAV_ITEMS.find((item) => item.tab === requested)?.tab ?? "general"
  })
  useTheme()

  useEffect(() => {
    const subscription = api.notifications.listen("plugin-deep-link-available", () => {
      setActiveTab("plugins")
    })
    return subscription.unlisten
  }, [])

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

  return (
    <div className={cn("flex flex-col h-screen", { "pt-7": isMacOS })}>
      <DragRegion
        className={cn("absolute top-0 left-0 right-0 h-7 border-b border-border", {
          hidden: !isMacOS,
        })}
      />

      <ShortcutTooltip text="Close" shortcut="escape">
        <button
          onClick={() =>
            getCurrentWindow()
              .close()
              .catch(() => {})
          }
          className={cn(
            "absolute top-[3px] right-2 z-50 rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring",
            { hidden: isMacOS },
          )}
          aria-label="Close"
        >
          <CloseIcon className="size-4" />
        </button>
      </ShortcutTooltip>

      <Tabs
        orientation="vertical"
        value={activeTab}
        onValueChange={(value) => {
          const item = NAV_ITEMS.find((item) => item.tab === value)
          if (item) setActiveTab(item.tab)
        }}
        className="min-h-0 flex-1"
      >
        <SettingsSidebar />

        {NAV_ITEMS.map(({ tab, page: Page }) => (
          <TabsContent key={tab} value={tab} className="min-h-0 min-w-0 data-[state=active]:flex">
            <Page />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
