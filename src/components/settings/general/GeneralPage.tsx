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

import type { TimeFormat } from "@/rpc/bindings"

import { useSettings } from "@/contexts/SettingsContext"

import { checkForUpdate, promptAndInstall, type Update } from "@/lib/updater"

export function GeneralPage() {
  return (
    <SettingsContent>
      <TimeFormatSection />
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
          className="cursor-pointer"
        />
        <Label htmlFor={id} className="cursor-pointer text-sm">
          Automatic sync
        </Label>
      </div>
      <p className="text-xs text-muted-foreground pl-7">
        Uncheck if you prefer to manually push/pull changes.
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

const AboutSection = () => {
  const [version, setVersion] = useState<string | null>(null)
  const [update, setUpdate] = useState<Update | null>(null)

  useEffect(() => {
    void getVersion().then(setVersion)
    void checkForUpdate().then(setUpdate)
  }, [])

  return (
    <div className="flex flex-col gap-2 w-[400px]">
      <label className="text-sm">About</label>
      <p className="text-xs text-muted-foreground">renCal{version ? ` v${version}` : ""}</p>
      {update && (
        <button
          type="button"
          onClick={() => void promptAndInstall(update)}
          className="text-xs text-primary hover:underline cursor-pointer w-fit"
        >
          {"There's an update available"}
        </button>
      )}
    </div>
  )
}
