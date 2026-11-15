import { View } from "nsh"

import { ReminderSelect } from "@/components/event-parts/inputs/ReminderSelect"
import {
  SettingsContent,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/SettingsContent"
import { Switch } from "@/components/ui/switch"

import {
  defaultReminders,
  notificationsEnabled,
  setDefaultReminders,
  setNotificationsEnabled,
} from "@/stores/settings"

export function RemindersPage() {
  return (
    <SettingsContent>
      <SettingsSection title="Notifications">
        <SettingsRow label="Enable notifications">
          <Switch
            accessibilityLabel="Enable notifications"
            checked={notificationsEnabled()}
            onChange={(enabled) => void setNotificationsEnabled(enabled)}
          />
        </SettingsRow>
        <SettingsRow label="Default reminders" description="Added to every new event.">
          <View class="w-[240px]">
            <ReminderSelect
              reminders={defaultReminders()}
              onSelect={(minutes) => void setDefaultReminders([...defaultReminders(), minutes])}
              onRemove={(minutes) =>
                void setDefaultReminders(defaultReminders().filter((m) => m !== minutes))
              }
              placeholder="Add reminder"
              variant="default"
              indentRows={false}
              addon={null}
            />
          </View>
        </SettingsRow>
      </SettingsSection>
    </SettingsContent>
  )
}
