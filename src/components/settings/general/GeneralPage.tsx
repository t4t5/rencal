import { getVersion } from "@tauri-apps/api/app"
import { open } from "@tauri-apps/plugin-dialog"
import { useEffect, useId, useState } from "react"

import { TimeZoneLabel, TimeZonePicker } from "@/components/event-parts/inputs/TimeZonePicker"
import { SettingsContent } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectMenuTrigger,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useSettings } from "@/contexts/SettingsContext"

import { useViewerTzid } from "@/hooks/useViewerTzid"
import {
  type EventTime,
  type FirstDayOfWeek,
  MAX_EXTRA_TIME_ZONES,
  nowZoned,
  type TimeFormat,
  timeZoneCity,
  timeZoneOffsetLabel,
} from "@/lib/event-time"
import { checkForUpdate, promptAndInstall, type Update } from "@/lib/updater"

import { CloseIcon } from "@/icons/close"

export function GeneralPage() {
  return (
    <SettingsContent>
      <TimeFormatSection />
      <FirstDayOfWeekSection />
      <WeekNumbersSection />
      <TimeZonesSection />
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

  return (
    <div className="flex flex-col gap-2 w-[150px]">
      <label className="text-sm">Start week on</label>
      <Select value={firstDayOfWeek} onValueChange={(v) => setFirstDayOfWeek(v as FirstDayOfWeek)}>
        <SelectTrigger className="w-full" variant="default">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="monday">Monday</SelectItem>
          <SelectItem value="sunday">Sunday</SelectItem>
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
        Show week numbers
      </Label>
    </div>
  )
}

// The zones the day and week views show times in: the viewer's own, which follows the
// system, and up to MAX_EXTRA_TIME_ZONES more.
const TimeZonesSection = () => {
  const { extraTimeZones, setExtraTimeZones } = useSettings()
  const viewerTzid = useViewerTzid()
  // Offsets as they are today.
  const [now] = useState(nowZoned)
  const taken = [viewerTzid, ...extraTimeZones]

  return (
    <div className="flex flex-col gap-2 w-[400px]">
      <label className="text-sm">Time zones</label>
      <div className="flex items-center gap-2 h-control px-2.5 text-sm">
        <TimeZoneLabel
          offset={timeZoneOffsetLabel(viewerTzid, now)}
          city={timeZoneCity(viewerTzid)}
          className="grow"
        />
        <span className="text-xs text-muted-foreground">Local</span>
      </div>
      {extraTimeZones.map((tzid, i) => (
        <div key={tzid} className="flex gap-2">
          <TimeZoneField
            value={tzid}
            at={now}
            exclude={taken.filter((other) => other !== tzid)}
            onSelect={(next) => void setExtraTimeZones(extraTimeZones.with(i, next))}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${timeZoneCity(tzid)}`}
            onClick={() => void setExtraTimeZones(extraTimeZones.toSpliced(i, 1))}
          >
            <CloseIcon className="size-3.5" />
          </Button>
        </div>
      ))}
      {extraTimeZones.length < MAX_EXTRA_TIME_ZONES && (
        <TimeZoneField
          at={now}
          exclude={taken}
          onSelect={(next) => void setExtraTimeZones([...extraTimeZones, next])}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Day and week views show these next to your local time.
      </p>
    </div>
  )
}

// A zone's row, or without a value the row that adds one.
const TimeZoneField = ({
  value,
  at,
  exclude,
  onSelect,
}: {
  value?: string
  at: EventTime
  exclude: string[]
  onSelect: (tzid: string) => void
}) => {
  const [open, setOpen] = useState(false)

  return (
    <TimeZonePicker
      value={value}
      at={at}
      open={open}
      onOpenChange={setOpen}
      onSelect={onSelect}
      exclude={exclude}
    >
      <SelectMenuTrigger variant="default" className="flex-1 min-w-0">
        {value ? (
          <TimeZoneLabel offset={timeZoneOffsetLabel(value, at)} city={timeZoneCity(value)} />
        ) : (
          <span className="text-muted-foreground">Add time zone</span>
        )}
      </SelectMenuTrigger>
    </TimeZonePicker>
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
        <Input value={calendarDir} readOnly variant="default" className="flex-1" />
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
