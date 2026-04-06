import { useState } from "react"

import { AccountsSection } from "@/components/settings/AccountsSection"
import { CalendarsSection } from "@/components/settings/CalendarsSection"
import { GeneralSection } from "@/components/settings/GeneralSection"
import { NAV_ITEMS, SettingsSidebar, SettingsTab } from "@/components/settings/SettingsSidebar"

import { cn, isMacOS } from "@/lib/utils"

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("accounts")

  return (
    <div className={cn("flex h-screen", { "pt-8": isMacOS })}>
      <div className="absolute top-0 left-0 right-0 h-8" data-tauri-drag-region />

      <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 flex flex-col gap-6 p-4 overflow-y-auto">
        <h1 className="text-xl font-bold">
          {NAV_ITEMS.find((item) => item.tab === activeTab)?.label}
        </h1>

        {activeTab === "general" && <GeneralSection />}
        {activeTab === "accounts" && <AccountsSection />}
        {activeTab === "calendars" && <CalendarsSection />}
      </div>
    </div>
  )
}
