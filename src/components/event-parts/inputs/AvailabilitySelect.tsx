import { ItemContent, ItemMedia } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

import type { EventAvailability } from "@/lib/cal-events"
import { cn } from "@/lib/utils"

import { CalendarIcon } from "@/icons/calendar"

export function AvailabilitySelect({
  value,
  onChange,
  readOnly,
}: {
  value: EventAvailability
  onChange: (availability: EventAvailability) => void
  readOnly?: boolean
}) {
  return (
    <Select
      value={value}
      disabled={readOnly}
      onValueChange={(next) => {
        if (next === "busy" || next === "free") onChange(next)
      }}
    >
      <SelectTrigger
        aria-label="Show as"
        controlLayout
        className={cn("w-full", readOnly && "disabled:cursor-default disabled:opacity-100")}
      >
        <ItemMedia>
          <CalendarIcon />
        </ItemMedia>
        <ItemContent className="flex gap-2 truncate text-left">
          <span className="text-muted-foreground">Show as</span>
          <span>{value === "busy" ? "Busy" : "Free"}</span>
        </ItemContent>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="busy">Busy</SelectItem>
        <SelectItem value="free">Free</SelectItem>
      </SelectContent>
    </Select>
  )
}
