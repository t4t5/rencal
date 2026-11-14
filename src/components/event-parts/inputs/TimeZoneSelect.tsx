import { useMemo, useState } from "react"

import { TimeZoneLabel, TimeZonePicker } from "@/components/event-parts/inputs/TimeZonePicker"
import { controlSurfaceActive } from "@/components/ui/control-surface"
import { ItemContent, ItemMedia } from "@/components/ui/item"
import { SelectIcon } from "@/components/ui/select"

import { useViewerTzid } from "@/hooks/useViewerTzid"
import { type EventTime, eventTzid, timeZoneCity, timeZoneOffsetLabel } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { GlobeIcon } from "@/icons/globe"

export const TimeZoneSelect = ({
  value,
  readOnly,
  defaultOpen = false,
  onChange,
}: {
  value: EventTime
  readOnly?: boolean
  defaultOpen?: boolean
  onChange: (tzid: string) => void
}) => {
  const viewerTzid = useViewerTzid()
  const tzid = eventTzid(value)
  const known = useMemo(() => [viewerTzid], [viewerTzid])

  const [open, setOpen] = useState(defaultOpen)

  return (
    <TimeZonePicker
      value={tzid}
      at={value}
      open={readOnly ? false : open}
      onOpenChange={setOpen}
      onSelect={onChange}
      known={known}
    >
      <button
        type="button"
        disabled={readOnly}
        data-control="select"
        className={cn(
          "control-row group h-control w-full rounded-md border border-transparent bg-transparent text-sm outline-none hover:border-input",
          controlSurfaceActive.focusVisible,
          controlSurfaceActive.open,
          readOnly && "pointer-events-none disabled:cursor-default",
        )}
      >
        <ItemMedia>
          <GlobeIcon />
        </ItemMedia>
        <ItemContent>
          <TimeZoneLabel offset={timeZoneOffsetLabel(tzid, value)} city={timeZoneCity(tzid)} />
        </ItemContent>
        {!readOnly && <SelectIcon forceVisible={open} />}
      </button>
    </TimeZonePicker>
  )
}
