import { i18n, type MessageDescriptor } from "@lingui/core"
import { msg, t } from "@lingui/core/macro"

import { ItemContent, ItemMedia } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { StatusDot } from "@/components/ui/status-dot"

import type { ResponseStatus } from "@/lib/cal-events"

const statusOptions: { value: ResponseStatus; label: MessageDescriptor }[] = [
  { value: "accepted", label: msg`Accepted` },
  { value: "declined", label: msg`Declined` },
  { value: "tentative", label: msg({ message: "Maybe", context: "rsvp" }) },
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
            i18n._(selected.label)
          ) : (
            <span className="text-placeholder-foreground">{t`My status`}</span>
          )}
        </ItemContent>
      </SelectTrigger>
      <SelectContent>
        {statusOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            <StatusDot status={opt.value} />
            {i18n._(opt.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
