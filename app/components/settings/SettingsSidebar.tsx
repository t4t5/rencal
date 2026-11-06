import { type JSX, Text, token, View } from "nsh"
import { Button as BaseButton } from "nsh/base"

import { AccountsPage } from "@/components/settings/accounts/AccountsPage"
import { AgentsPage } from "@/components/settings/agents/AgentsPage"
import { CalendarsPage } from "@/components/settings/calendars/CalendarsPage"
import { GeneralPage } from "@/components/settings/general/GeneralPage"
import { PluginsPage } from "@/components/settings/plugins/PluginsPage"
import { pluginUpdateCount } from "@/components/settings/plugins/plugin-updates"
import { RemindersPage } from "@/components/settings/reminders/RemindersPage"
import { ShortcutsPage } from "@/components/settings/shortcuts/ShortcutsPage"
import { ThemesPage } from "@/components/settings/themes/ThemesPage"

import { cn } from "@/lib/utils"

import {
  AgentIcon,
  BellIcon,
  CalendarIcon,
  KeyboardIcon,
  PaletteIcon,
  PluginIcon,
  SettingsIcon,
  UserIcon,
} from "@/icons"
import { setSettingsTab, settingsTab } from "@/stores/view"

type NavItem = {
  tab: string
  label: string
  icon: (props: { class?: string; color?: string }) => JSX.Element
  page: () => JSX.Element
}

export const NAV_ITEMS: NavItem[] = [
  { tab: "general", label: "General", icon: SettingsIcon, page: GeneralPage },
  { tab: "accounts", label: "Accounts", icon: UserIcon, page: AccountsPage },
  { tab: "calendars", label: "Calendars", icon: CalendarIcon, page: CalendarsPage },
  { tab: "reminders", label: "Reminders", icon: BellIcon, page: RemindersPage },
  { tab: "themes", label: "Themes", icon: PaletteIcon, page: ThemesPage },
  { tab: "shortcuts", label: "Shortcuts", icon: KeyboardIcon, page: ShortcutsPage },
  { tab: "plugins", label: "Plugins", icon: PluginIcon, page: PluginsPage },
  { tab: "agents", label: "Agents", icon: AgentIcon, page: AgentsPage },
]

export function SettingsSidebar() {
  return (
    <View class="w-[200px] shrink-0 gap-1 border-r border-border bg-sidebar p-1 py-(--layout-padding)">
      <Each of={NAV_ITEMS} key={(item) => item.tab}>
        {(item) => {
          const active = () => settingsTab() === item().tab
          const updates = () => (item().tab === "plugins" ? pluginUpdateCount() : 0)
          return (
            <BaseButton
              onPress={() => setSettingsTab(item().tab)}
              class={cn(
                "flex-row items-center gap-2 rounded-(--radius-md) px-2 py-2 hover:bg-hover",
                active() && "bg-secondary",
              )}
            >
              {item().icon({
                class: "size-4",
                color: token(active() ? "secondary-foreground" : "muted-foreground"),
              })}
              <Text
                class={cn(
                  "flex-1 text-sm",
                  active() ? "text-secondary-foreground" : "text-muted-foreground",
                )}
              >
                {item().label}
              </Text>
              <If when={updates() > 0}>
                <View
                  accessibilityLabel={`${updates()} plugin ${updates() === 1 ? "update" : "updates"} available`}
                  class="h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1"
                >
                  <Text class="text-xs font-medium text-brand-foreground">{updates()}</Text>
                </View>
              </If>
            </BaseButton>
          )
        }}
      </Each>
    </View>
  )
}
