import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useSettings } from "@/contexts/SettingsContext"

import { formatWallclockTime, type TimeFormat } from "@/lib/event-time"

import { TIME_STEP_MINUTES } from "./picked-days"

function formatMinutes(minutes: number, timeFormat: TimeFormat): string {
  const hour = Math.floor(minutes / 60)
  // Midnight as an end time: "24:00", or "12:00 AM".
  return formatWallclockTime(timeFormat === "12h" ? hour % 24 : hour, minutes % 60, timeFormat)
}

/** Minutes past midnight in 15-minute steps, from `min` to `max` inclusive. */
export function TimeSelect({
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  value: number
  min: number
  max: number
  disabled?: boolean
  onChange: (minutes: number) => void
}) {
  const { timeFormat } = useSettings()
  const options = Array.from(
    { length: Math.floor((max - min) / TIME_STEP_MINUTES) + 1 },
    (_, i) => min + i * TIME_STEP_MINUTES,
  )

  return (
    <Select
      value={String(value)}
      disabled={disabled}
      onValueChange={(next) => onChange(Number(next))}
    >
      <SelectTrigger variant="default" className="w-[5.5rem] tabular-nums">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {options.map((minutes) => (
          <SelectItem key={minutes} value={String(minutes)} className="tabular-nums">
            {formatMinutes(minutes, timeFormat)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
