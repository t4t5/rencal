import { t } from "@lingui/core/macro"
import { getVersion } from "@tauri-apps/api/app"
import { open } from "@tauri-apps/plugin-dialog"
import { useEffect, useId, useState } from "react"

import { SettingsContent } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useSettings } from "@/contexts/SettingsContext"

import type { TimeFormat } from "@/lib/event-time"
import { weekdayNames, type FirstDayOfWeek } from "@/lib/event-time"
import { checkForUpdate, promptAndInstall, type Update } from "@/lib/updater"

export function GeneralPage() {
  return (
    <SettingsContent>
      <TimeFormatSection />
      <FirstDayOfWeekSection />
      <WeekNumbersSection />
      <DataDirectorySection />
      <AutoSyncSection />
      <hr />
      <AboutSection />
    </SettingsContent>
  )
}

const TimeFormatSection = () => {
  const { timeFormat, setTimeFormat } = useSettings()

  return (
    <div className="flex flex-col gap-2 w-[150px]">
      <label className="text-sm">{t`Time format`}</label>
      <Select value={timeFormat} onValueChange={(v) => setTimeFormat(v as TimeFormat)}>
        <SelectTrigger className="w-full" variant="default">
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

const FirstDayOfWeekSection = () => {
  const { firstDayOfWeek, setFirstDayOfWeek } = useSettings()
  const weekdays = weekdayNames("long")

  return (
    <div className="flex flex-col gap-2 w-[150px]">
      <label className="text-sm">{t`Start week on`}</label>
      <Select value={firstDayOfWeek} onValueChange={(v) => setFirstDayOfWeek(v as FirstDayOfWeek)}>
        <SelectTrigger className="w-full" variant="default">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="monday">{weekdays[0]}</SelectItem>
          <SelectItem value="sunday">{weekdays[6]}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

const WeekNumbersSection = () => {
  const { showWeekNumbers, setShowWeekNumbers } = useSettings()
  const id = useId()

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={showWeekNumbers}
        onCheckedChange={(checked) => void setShowWeekNumbers(checked === true)}
      />
      <Label htmlFor={id} className="text-sm">
        {t`Show week numbers`}
      </Label>
    </div>
  )
}

const AutoSyncSection = () => {
  const { autoSyncEnabled, setAutoSyncEnabled } = useSettings()
  const id = useId()

  return (
    <div className="flex flex-col gap-1 w-[400px]">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={autoSyncEnabled}
          onCheckedChange={(checked) => void setAutoSyncEnabled(checked === true)}
        />
        <Label htmlFor={id} className="text-sm">
          {t`Automatic sync`}
        </Label>
      </div>
      <p className="text-xs text-muted-foreground pl-7">
        {t`Uncheck if you prefer to manually push/pull changes.`}
      </p>
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
      <label className="text-sm">{t`Data directory`}</label>
      <div className="flex gap-2">
        <Input value={calendarDir} readOnly variant="default" className="flex-1" />
        <Button variant="secondary" onClick={onChange}>
          {t({ message: "Change", context: "change data directory button" })}
        </Button>
      </div>
    </div>
  )
}

const AboutSection = () => {
  const [version, setVersion] = useState<string | null>(null)
  const [update, setUpdate] = useState<Update | null>(null)

  useEffect(() => {
    void getVersion().then(setVersion)
    void checkForUpdate().then(setUpdate)
  }, [])

  return (
    <div className="flex flex-col gap-2 w-[400px]">
      <label className="text-sm">{t`About`}</label>
      <p className="text-xs text-muted-foreground">renCal{version ? ` v${version}` : ""}</p>
      {update && (
        <button
          type="button"
          onClick={() => void promptAndInstall(update)}
          className="text-xs text-primary hover:underline cursor-pointer w-fit"
        >
          {t`There's an update available`}
        </button>
      )}
    </div>
  )
}
