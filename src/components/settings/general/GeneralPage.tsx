import { open } from "@tauri-apps/plugin-dialog"

import { ReminderSelect } from "@/components/event-parts/inputs/ReminderSelect"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import type { TimeFormat } from "@/rpc/bindings"

import { useSettings } from "@/contexts/SettingsContext"

export function GeneralPage() {
  return (
    <div className="flex flex-col gap-4">
      <TimeFormatSection />
      <DefaultRemindersSection />
      <DataDirectorySection />
    </div>
  )
}

const TimeFormatSection = () => {
  const { timeFormat, setTimeFormat } = useSettings()

  return (
    <div className="flex flex-col gap-2 w-[300px]">
      <label className="text-sm">Time format</label>
      <Select value={timeFormat} onValueChange={(v) => setTimeFormat(v as TimeFormat)}>
        <SelectTrigger className="w-full" ghost={false}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="24h">24h</SelectItem>
          <SelectItem value="12h">12h</SelectItem>
        </SelectContent>
      </Select>
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
        rowClassName="pl-4"
        addon={null}
      />
    </div>
  )
}

const DataDirectorySection = () => {
  const { calendarDir, setCalendarDir } = useSettings()

  const onChange = async () => {
    const selected = await open({ directory: true, multiple: false })
    if (typeof selected !== "string") return
    await setCalendarDir(selected)
  }

  return (
    <div className="flex flex-col gap-2 w-[400px]">
      <label className="text-sm">Data directory</label>
      <div className="flex gap-2">
        <Input value={calendarDir} readOnly ghost={false} className="flex-1" />
        <Button variant="secondary" onClick={onChange}>
          Change
        </Button>
      </div>
    </div>
  )
}
