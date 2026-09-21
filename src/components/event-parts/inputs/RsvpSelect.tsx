import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  return (
    <Select value={status ?? undefined} onValueChange={(v) => onRsvp(v as ResponseStatus)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="My status" />
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
