import { Text } from "nsh"

import { ReminderSelect } from "@/components/event-parts/inputs/ReminderSelect"
import { SettingsContent, SettingsField } from "@/components/settings/SettingsContent"
import { Checkbox } from "@/components/ui/checkbox"

import {
  defaultReminders,
  notificationsEnabled,
  setDefaultReminders,
  setNotificationsEnabled,
} from "@/stores/settings"

export function RemindersPage() {
  return (
    <SettingsContent>
      <Checkbox
        class="gap-3"
        checked={notificationsEnabled()}
        onChange={(enabled) => void setNotificationsEnabled(enabled)}
      >
        <Text class="text-sm">Enable notifications</Text>
      </Checkbox>
      <SettingsField label="Default reminders" class="w-[300px]">
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
      </SettingsField>
    </SettingsContent>
  )
}
