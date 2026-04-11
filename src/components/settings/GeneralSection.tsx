import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import type { TimeFormat } from "@/rpc/bindings"

import { useSettings } from "@/contexts/SettingsContext"

export function GeneralSection() {
  const { timeFormat, setTimeFormat } = useSettings()

  return (
    <div className="flex flex-col gap-4">
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
    </div>
  )
}
