import { useId } from "react"

import { ReminderSelect } from "@/components/event-parts/inputs/ReminderSelect"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

import { useSettings } from "@/contexts/SettingsContext"

export function RemindersPage() {
  return (
    <div className="flex flex-col gap-6">
      <NotificationsSection />
      <DefaultRemindersSection />
    </div>
  )
}

const NotificationsSection = () => {
  const { notificationsEnabled, setNotificationsEnabled } = useSettings()
  const id = useId()

  return (
    <div className="flex flex-col gap-2 w-[300px]">
      <div className="flex items-center gap-3">
        <Checkbox
          id={id}
          checked={notificationsEnabled}
          onCheckedChange={(checked) => void setNotificationsEnabled(checked === true)}
          className="cursor-pointer"
        />
        <Label htmlFor={id} className="cursor-pointer text-sm">
          Enable notifications
        </Label>
      </div>
    </div>
  )
}

const DefaultRemindersSection = () => {
  const { defaultReminders, setDefaultReminders } = useSettings()

  return (
    <div className="flex flex-col gap-2 w-[300px]">
      <label className="text-sm">Default reminders</label>
      <ReminderSelect
        reminders={defaultReminders}
        onSelect={(mins) => setDefaultReminders([...defaultReminders, mins])}
        onRemove={(mins) => setDefaultReminders(defaultReminders.filter((m) => m !== mins))}
        placeholder="Add reminder"
        ghost={false}
        withInputGroupAddon={false}
        addon={null}
      />
    </div>
  )
}
