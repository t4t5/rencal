import { useId, useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useSettings } from "@/contexts/SettingsContext"

import { getErrorMessage, type VisibleHours } from "@/lib/api"
import { formatWallclockTime } from "@/lib/event-time"

export function VisibleHoursSection() {
  const { visibleHours, setVisibleHours, timeFormat } = useSettings()
  const id = useId()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hours = visibleHours ?? { start_hour: 8, end_hour: 20 }

  const save = async (next: VisibleHours | null) => {
    setSaving(true)
    setError(null)
    try {
      await setVisibleHours(next)
    } catch (e) {
      setError(getErrorMessage(e, "Could not save preferred visible hours."))
    } finally {
      setSaving(false)
    }
  }

  const hourLabel = (hour: number) =>
    hour === 24
      ? timeFormat === "24h"
        ? "24:00"
        : "12:00 AM (end of day)"
      : formatWallclockTime(hour, 0, timeFormat)

  return (
    <div className="flex flex-col gap-2 w-[400px]">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={visibleHours !== null}
          disabled={saving}
          onCheckedChange={(checked) => void save(checked === true ? hours : null)}
        />
        <Label htmlFor={id} className="text-sm">
          Preferred visible hours
        </Label>
      </div>
      <p id={`${id}-description`} className="text-xs text-muted-foreground">
        Fit these hours in the week view. Scroll up or down to see the rest of the day.
      </p>
      <div className="flex gap-3">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <Label htmlFor={`${id}-start`} className="text-sm">
            Start
          </Label>
          <Select
            value={String(hours.start_hour)}
            disabled={visibleHours === null || saving}
            onValueChange={(value) => void save({ ...hours, start_hour: Number(value) })}
          >
            <SelectTrigger
              id={`${id}-start`}
              aria-describedby={`${id}-description`}
              variant="default"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: hours.end_hour }, (_, hour) => (
                <SelectItem key={hour} value={String(hour)}>
                  {hourLabel(hour)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <Label htmlFor={`${id}-end`} className="text-sm">
            End
          </Label>
          <Select
            value={String(hours.end_hour)}
            disabled={visibleHours === null || saving}
            onValueChange={(value) => void save({ ...hours, end_hour: Number(value) })}
          >
            <SelectTrigger
              id={`${id}-end`}
              aria-describedby={`${id}-description`}
              variant="default"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from(
                { length: 24 - hours.start_hour },
                (_, i) => i + hours.start_hour + 1,
              ).map((hour) => (
                <SelectItem key={hour} value={String(hour)}>
                  {hourLabel(hour)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
