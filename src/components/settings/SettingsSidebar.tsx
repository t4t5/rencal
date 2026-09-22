import { ComponentType } from "react"

import { AccountsPage } from "@/components/settings/accounts/AccountsPage"
import { CalendarsPage } from "@/components/settings/calendars/CalendarsPage"
import { GeneralPage } from "@/components/settings/general/GeneralPage"
import { PluginsPage } from "@/components/settings/plugins/PluginsPage"
import { RemindersPage } from "@/components/settings/reminders/RemindersPage"
import { ThemesPage } from "@/components/settings/themes/ThemesPage"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"

import { IconType } from "@/lib/types"

import { BellIcon } from "@/icons/bell"
import { CalendarIcon } from "@/icons/calendar"
import { PaletteIcon } from "@/icons/palette"
import { PluginIcon } from "@/icons/plugin"
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
  { tab: "plugins" as const, label: "Plugins", icon: PluginIcon, page: PluginsPage },
] satisfies NavItem[]

export type SettingsTab = (typeof NAV_ITEMS)[number]["tab"]

export function SettingsSidebar() {
  return (
    <TabsList
      variant="navigation"
      aria-label="Settings"
      className="w-[200px] shrink-0 self-stretch justify-start rounded-none border-r border-border px-2 py-3 group-data-[orientation=vertical]/tabs:h-full"
    >
      {NAV_ITEMS.map(({ tab, label, icon: Icon }) => (
        <TabsTrigger key={tab} value={tab}>
          <Icon className="size-4" />
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}
