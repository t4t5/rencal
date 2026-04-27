import { IconType } from "@/lib/types"
import { cn } from "@/lib/utils"

import { CalendarIcon } from "@/icons/calendar"
import { PaletteIcon } from "@/icons/palette"
import { SettingsIcon } from "@/icons/settings"
import { UserIcon } from "@/icons/user"

interface NavItem {
  tab: string
  label: string
  icon: IconType
}

export const NAV_ITEMS = [
  { tab: "general" as const, label: "General", icon: SettingsIcon },
  { tab: "accounts" as const, label: "Accounts", icon: UserIcon },
  { tab: "calendars" as const, label: "Calendars", icon: CalendarIcon },
  { tab: "themes" as const, label: "Themes", icon: PaletteIcon },
] satisfies NavItem[]

export type SettingsTab = (typeof NAV_ITEMS)[number]["tab"]

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
