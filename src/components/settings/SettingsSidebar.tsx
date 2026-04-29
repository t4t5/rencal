import { ComponentType } from "react"

import { AccountsPage } from "@/components/settings/accounts/AccountsPage"
import { CalendarsPage } from "@/components/settings/calendars/CalendarsPage"
import { GeneralPage } from "@/components/settings/general/GeneralPage"
import { RemindersPage } from "@/components/settings/reminders/RemindersPage"
import { ThemesPage } from "@/components/settings/themes/ThemesPage"

import { IconType } from "@/lib/types"
import { cn } from "@/lib/utils"

import { BellIcon } from "@/icons/bell"
import { CalendarIcon } from "@/icons/calendar"
import { PaletteIcon } from "@/icons/palette"
import { SettingsIcon } from "@/icons/settings"
import { UserIcon } from "@/icons/user"

interface NavItem {
  tab: string
  label: string
  icon: IconType
  page: ComponentType
}

export const NAV_ITEMS = [
  { tab: "general" as const, label: "General", icon: SettingsIcon, page: GeneralPage },
  { tab: "accounts" as const, label: "Accounts", icon: UserIcon, page: AccountsPage },
  { tab: "calendars" as const, label: "Calendars", icon: CalendarIcon, page: CalendarsPage },
  { tab: "reminders" as const, label: "Reminders", icon: BellIcon, page: RemindersPage },
  { tab: "themes" as const, label: "Themes", icon: PaletteIcon, page: ThemesPage },
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
