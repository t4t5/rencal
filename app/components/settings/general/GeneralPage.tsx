import { signal } from "nsh"
import { Backend } from "rencal/native"

import {
  ErrorText,
  SettingsContent,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import { Segmented } from "@/components/ui/segmented"
import { Switch } from "@/components/ui/switch"

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
import {
  availableUpdate,
  installUpdate,
  updateActionLabel,
  updateError,
  updatePhase,
} from "@/stores/update"

const TIME_FORMATS: { value: TimeFormat; title: string }[] = [
  { value: "24h", title: "24h" },
  { value: "12h", title: "12h" },
]

const FIRST_DAYS: { value: FirstDayOfWeek; title: string }[] = [
  { value: "monday", title: "Monday" },
  { value: "sunday", title: "Sunday" },
]

export function GeneralPage() {
  return (
    <SettingsContent>
      <SettingsSection title="Calendar">
        <SettingsRow label="Time format">
          <Segmented
            items={TIME_FORMATS}
            value={timeFormat()}
            onChange={(value) => void setTimeFormat(value)}
          />
        </SettingsRow>
        <SettingsRow label="Start week on">
          <Segmented
            items={FIRST_DAYS}
            value={firstDayOfWeek()}
            onChange={(value) => void setFirstDayOfWeek(value)}
          />
        </SettingsRow>
        <SettingsRow label="Show week numbers">
          <Switch
            accessibilityLabel="Show week numbers"
            checked={showWeekNumbers()}
            onChange={(show) => void setShowWeekNumbers(show)}
          />
        </SettingsRow>
        {/* Time zones are added and changed on the time grid itself, so this only points there. */}
        <SettingsRow
          label="Time zones"
          description="Add time zones with the + above the hours in day and week view. Click a zone's name to change or remove it."
        />
      </SettingsSection>
      <SettingsSection title="Sync">
        <SettingsRow
          label="Automatic sync"
          description="Turn off to push and pull changes yourself."
        >
          <Switch
            accessibilityLabel="Automatic sync"
            checked={autoSyncEnabled()}
            onChange={(on) => void setAutoSyncEnabled(on)}
          />
        </SettingsRow>
        <DataDirectoryRow />
      </SettingsSection>
      <SettingsSection title="About">
        <SettingsRow
          label="renCal"
          description={`Version ${appInfo.version}`}
          detail={<ErrorText class="text-xs" message={updateError()} />}
        >
          <If when={availableUpdate()}>
            <Button
              variant="secondary"
              size="sm"
              label={updateActionLabel(`Update to v${availableUpdate()?.version}`)}
              disabled={updatePhase() !== "idle"}
              onPress={() => void installUpdate()}
            />
          </If>
        </SettingsRow>
      </SettingsSection>
    </SettingsContent>
  )
}

function DataDirectoryRow() {
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
    <SettingsRow
      label="Data directory"
      description={calendarDir()}
      detail={<ErrorText class="text-xs" message={error()} />}
    >
      <Button variant="secondary" size="sm" label="Change" onPress={() => void change()} />
    </SettingsRow>
  )
}
