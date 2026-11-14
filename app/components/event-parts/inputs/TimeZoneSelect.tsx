import { signal, token } from "nsh"

import { TimeZoneLabel, TimeZonePicker } from "@/components/event-parts/inputs/TimeZonePicker"
import { ItemContent, ItemMedia } from "@/components/ui/item"

import {
  type EventTime,
  eventTzid,
  getViewerTzid,
  timeZoneCity,
  timeZoneOffsetLabel,
} from "@/lib/event-time"

import { GlobeIcon } from "@/icons"

export function TimeZoneSelect(props: {
  value: EventTime
  readOnly?: boolean
  defaultOpen?: boolean
  onChange: (tzid: string) => void
}) {
  const tzid = () => eventTzid(props.value)
  const open = signal(props.defaultOpen ?? false)

  return (
    <TimeZonePicker
      class="min-w-0 flex-1"
      triggerClass="w-full"
      value={tzid()}
      at={props.value}
      open={open()}
      disabled={props.readOnly}
      known={[getViewerTzid()]}
      onOpenChange={(next) => open.set(next)}
      onSelect={(zone) => props.onChange(zone)}
      label={
        <>
          <ItemMedia>
            <GlobeIcon color={token("muted-foreground")} />
          </ItemMedia>
          <ItemContent>
            <TimeZoneLabel
              offset={timeZoneOffsetLabel(tzid(), props.value)}
              city={timeZoneCity(tzid())}
            />
          </ItemContent>
        </>
      }
    />
  )
}
