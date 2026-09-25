import { ItemContent, ItemMedia } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { StatusDot } from "@/components/ui/status-dot"

import type { ResponseStatus } from "@/lib/cal-events"

const statusOptions: { value: ResponseStatus; label: string }[] = [
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "tentative", label: "Maybe" },
]

export function RsvpSelect({
  status,
  onRsvp,
}: {
  status?: ResponseStatus | null
  onRsvp: (response: ResponseStatus) => void
}) {
  const selected = statusOptions.find((opt) => opt.value === status)

  return (
    <Select value={status ?? undefined} onValueChange={(v) => onRsvp(v as ResponseStatus)}>
      <SelectTrigger controlLayout className="w-full">
        <ItemMedia>
          <StatusDot status={status} />
        </ItemMedia>
        <ItemContent className="truncate text-left">
          {selected ? (
            selected.label
          ) : (
            <span className="text-placeholder-foreground">My status</span>
          )}
        </ItemContent>
      </SelectTrigger>
      <SelectContent>
        {statusOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            <StatusDot status={opt.value} />
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
