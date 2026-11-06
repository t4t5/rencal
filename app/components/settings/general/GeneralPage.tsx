import { signal, Text, View } from "nsh"
import { Backend } from "rencal/native"

import { ErrorText, SettingsContent, SettingsField } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

import { getErrorMessage } from "@/lib/api"
import type { FirstDayOfWeek, TimeFormat } from "@/lib/event-time"

import appInfo from "@/nsh.json"
import {
  autoSyncEnabled,
  calendarDir,
  firstDayOfWeek,
  setAutoSyncEnabled,
  setCalendarDir,
  setFirstDayOfWeek,
  setShowWeekNumbers,
  setTimeFormat,
  showWeekNumbers,
  timeFormat,
} from "@/stores/settings"

const TIME_FORMATS = [
  { value: "24h", title: "24h" },
  { value: "12h", title: "12h" },
]

const FIRST_DAYS = [
  { value: "monday", title: "Monday" },
  { value: "sunday", title: "Sunday" },
]

export function GeneralPage() {
  return (
    <SettingsContent>
      <SettingsField label="Time format" class="w-[150px]">
        <Select
          variant="default"
          items={TIME_FORMATS}
          value={timeFormat()}
          onChange={(value) => void setTimeFormat(value as TimeFormat)}
        />
      </SettingsField>
      <SettingsField label="Start week on" class="w-[150px]">
        <Select
          variant="default"
          items={FIRST_DAYS}
          value={firstDayOfWeek()}
          onChange={(value) => void setFirstDayOfWeek(value as FirstDayOfWeek)}
        />
      </SettingsField>
      <Checkbox checked={showWeekNumbers()} onChange={(show) => void setShowWeekNumbers(show)}>
        <Text class="text-sm">Show week numbers</Text>
      </Checkbox>
      <DataDirectorySection />
      <View class="w-[400px] gap-1">
        <Checkbox checked={autoSyncEnabled()} onChange={(on) => void setAutoSyncEnabled(on)}>
          <Text class="text-sm">Automatic sync</Text>
        </Checkbox>
        <Text class="pl-6 text-xs text-muted-foreground">
          Uncheck if you prefer to manually push/pull changes.
        </Text>
      </View>
      <View class="h-px bg-border" />
      <SettingsField label="About" class="w-[400px]">
        <Text class="text-xs text-muted-foreground">renCal v{appInfo.version}</Text>
      </SettingsField>
    </SettingsContent>
  )
}

function DataDirectorySection() {
  const error = signal<string | null>(null)

  const change = async () => {
    error.set(null)
    try {
      const picked = await Backend.pickPath(true, "Choose the data directory", [])
      if (picked) await setCalendarDir(picked)
    } catch (e) {
      error.set(getErrorMessage(e, "Failed to change the data directory"))
    }
  }

  return (
    <SettingsField label="Data directory" class="w-[400px]">
      <View class="flex-row gap-2">
        <Input variant="default" class="flex-1" value={calendarDir()} readonly />
        <Button variant="secondary" label="Change" onPress={() => void change()} />
      </View>
      <ErrorText message={error()} />
    </SettingsField>
  )
}
