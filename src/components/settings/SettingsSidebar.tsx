import { i18n, type MessageDescriptor } from "@lingui/core"
import { msg, t } from "@lingui/core/macro"
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
  label: MessageDescriptor
  icon: IconType
  page: ComponentType
}

export const NAV_ITEMS = [
  {
    tab: "general" as const,
    label: msg({ message: "General", context: "settings page" }),
    icon: SettingsIcon,
    page: GeneralPage,
  },
  { tab: "accounts" as const, label: msg`Accounts`, icon: UserIcon, page: AccountsPage },
  { tab: "calendars" as const, label: msg`Calendars`, icon: CalendarIcon, page: CalendarsPage },
  { tab: "reminders" as const, label: msg`Reminders`, icon: BellIcon, page: RemindersPage },
  { tab: "themes" as const, label: msg`Themes`, icon: PaletteIcon, page: ThemesPage },
  { tab: "plugins" as const, label: msg`Plugins`, icon: PluginIcon, page: PluginsPage },
] satisfies NavItem[]

export type SettingsTab = (typeof NAV_ITEMS)[number]["tab"]

export function SettingsSidebar() {
  return (
    <nav
      data-slot="settings-sidebar"
      className="flex w-[200px] shrink-0 self-stretch border-r border-border bg-sidebar"
    >
      <TabsList
        variant="navigation"
        aria-label={t`Settings`}
        className="w-full justify-start rounded-none py-(--layout-padding) group-data-[orientation=vertical]/tabs:h-full"
      >
        {NAV_ITEMS.map(({ tab, label, icon: Icon }) => (
          <TabsTrigger key={tab} value={tab} data-page={tab}>
            <Icon className="size-4" />
            {i18n._(label)}
          </TabsTrigger>
        ))}
      </TabsList>
    </nav>
  )
}
