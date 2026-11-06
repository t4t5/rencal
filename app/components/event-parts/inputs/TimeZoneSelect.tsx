import { computed, signal, Text, token, View } from "nsh"

import { ItemContent, ItemMedia } from "@/components/ui/item"
import { Select } from "@/components/ui/select"

import {
  type EventTime,
  eventTzid,
  getViewerTzid,
  listTimeZones,
  timeZoneCity,
  timeZoneOffsetLabel,
} from "@/lib/event-time"

import { GlobeIcon } from "@/icons"

function TimeZoneLabel(props: { offset: string; city: string }) {
  return (
    <View class="min-w-0 flex-row items-baseline gap-1.5">
      <Text class="shrink-0 text-sm text-muted-foreground">{props.offset}</Text>
      <Text class="truncate text-sm text-foreground">{props.city}</Text>
    </View>
  )
}

export function TimeZoneSelect(props: {
  value: EventTime
  readOnly?: boolean
  defaultOpen?: boolean
  onChange: (tzid: string) => void
}) {
  const tzid = () => eventTzid(props.value)
  const open = signal(props.defaultOpen ?? false)

  // Built on opening: DST-aware offsets for every zone are expensive. The title
  // is what search matches, so it holds the region and offset too.
  const options = computed(() => {
    if (!open()) return []
    const known = [tzid(), getViewerTzid()].filter((zone) => !listTimeZones().includes(zone))
    return [...known, ...listTimeZones()]
      .map((zone) => {
        const city = timeZoneCity(zone)
        const offset = timeZoneOffsetLabel(zone, props.value)
        const region = zone.replaceAll("_", " ").replaceAll("/", " ")
        return { value: zone, title: `${city} ${region} ${offset}`, city, offset }
      })
      .sort((a, b) => a.city.localeCompare(b.city))
  })

  return (
    <Select
      class="min-w-0 flex-1"
      triggerClass="w-full"
      items={options()}
      value={tzid()}
      open={open()}
      disabled={props.readOnly}
      searchable
      searchPlaceholder="Search timezones"
      searchAccessibilityLabel="Search timezones"
      accessibilityLabel="Time zone"
      empty={
        <Text class="px-2 py-6 text-center text-sm text-muted-foreground">No timezones found.</Text>
      }
      onOpenChange={(event) => open.set(event.open)}
      onChange={(zone) => zone && zone !== tzid() && props.onChange(zone)}
      renderItem={(item) => {
        const option = options().find((candidate) => candidate.value === item.value)
        return (
          <View class="px-2 py-1.5">
            <TimeZoneLabel offset={option?.offset ?? ""} city={option?.city ?? item.title} />
          </View>
        )
      }}
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
