import { useState } from "react"

import { NAV_ITEMS, SettingsSidebar, SettingsTab } from "@/components/settings/SettingsSidebar"
import { AccountsPage } from "@/components/settings/accounts/AccountsPage"
import { CalendarsPage } from "@/components/settings/calendars/CalendarsPage"
import { GeneralPage } from "@/components/settings/general/GeneralPage"
import { DragRegion } from "@/components/ui/drag-region"

import { cn, isMacOS } from "@/lib/utils"

export function SettingsWindow() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general")

  return (
    <div className={cn("flex h-screen", { "pt-8": isMacOS })}>
      <DragRegion className="absolute top-0 left-0 right-0 h-8" />

      <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 flex flex-col gap-6 p-4 overflow-y-auto">
        <h1 className="text-xl font-bold font-heading">
          {NAV_ITEMS.find((item) => item.tab === activeTab)?.label}
        </h1>

        {activeTab === "general" && <GeneralPage />}
        {activeTab === "accounts" && <AccountsPage />}
        {activeTab === "calendars" && <CalendarsPage />}
      </div>
    </div>
  )
}
