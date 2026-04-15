import { IconType } from "@/lib/types"
import { cn } from "@/lib/utils"

import { CalendarIcon } from "@/icons/calendar"
import { SettingsIcon } from "@/icons/settings"
import { UserIcon } from "@/icons/user"

export type SettingsTab = "general" | "accounts" | "calendars"

export const NAV_ITEMS: {
  tab: SettingsTab
  label: string
  icon: IconType
}[] = [
  { tab: "general", label: "General", icon: SettingsIcon },
  { tab: "accounts", label: "Accounts", icon: UserIcon },
  { tab: "calendars", label: "Calendars", icon: CalendarIcon },
]

function SidebarItem({
  item,
  isActive,
  onClick,
}: {
  item: (typeof NAV_ITEMS)[number]
  isActive: boolean
  onClick: () => void
}) {
  const { label, icon: Icon } = item
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 p-2 text-sm rounded-md w-full text-left text-muted-foreground transition-colors",
        {
          "bg-secondary text-accent-foreground": isActive,
        },
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}

export function SettingsSidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}) {
  return (
    <nav className="flex flex-col gap-1 w-[200px] shrink-0 py-5 px-4">
      <span className="text-sm text-muted-foreground pb-2">Settings</span>

      {NAV_ITEMS.map((item) => (
        <SidebarItem
          key={item.tab}
          item={item}
          isActive={activeTab === item.tab}
          onClick={() => onTabChange(item.tab)}
        />
      ))}
    </nav>
  )
}
