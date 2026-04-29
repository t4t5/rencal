import { useState } from "react"

import { NAV_ITEMS, SettingsSidebar, SettingsTab } from "@/components/settings/SettingsSidebar"
import { DragRegion } from "@/components/ui/drag-region"

import { useTheme } from "@/hooks/useTheme"
import { cn, isMacOS } from "@/lib/utils"

export function SettingsWindow() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general")
  useTheme()

  const activeItem = NAV_ITEMS.find((item) => item.tab === activeTab)
  if (!activeItem) return null
  const { label, page: ActivePage } = activeItem

  return (
    <div className={cn("flex h-screen", { "pt-8": isMacOS })}>
      <DragRegion className="absolute top-0 left-0 right-0 h-5!" />

      <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 flex flex-col gap-6 px-4 overflow-y-auto pb-8 pt-6">
        <h1 className="text-lg font-semibold heading">{label}</h1>

        <ActivePage />
      </div>
    </div>
  )
}
