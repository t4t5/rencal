import { computed, type JSX, Text, View } from "nsh"

import { Select } from "@/components/ui/select"

import { type EventTime, listTimeZones, timeZoneCity, timeZoneOffsetLabel } from "@/lib/event-time"

/** "GMT+1 Stockholm", the offset set back from the city. */
export function TimeZoneLabel(props: { offset: string; city: string }) {
  return (
    <View class="min-w-0 flex-row items-baseline gap-1.5">
      <Text class="shrink-0 text-sm text-muted-foreground">{props.offset}</Text>
      <Text class="truncate text-sm text-foreground">{props.city}</Text>
    </View>
  )
}

/**
 * A searchable list of timezones on a trigger: the select field showing `label`,
 * or the caller's own `trigger`. Offsets are the zones' at `at`, since they change
 * with daylight saving.
 */
export function TimeZonePicker(props: {
  /** The zone chosen now, if any: the list opens on it. */
  value?: string
  at: EventTime
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (tzid: string) => void
  /** Zones to offer even where the tz database doesn't list them. */
  known?: readonly string[]
  /** Zones to leave out, e.g. ones already chosen elsewhere. */
  exclude?: readonly string[]
  disabled?: boolean
  class?: string
  triggerClass?: string
  popupClass?: string
  accessibilityLabel?: string
  label?: JSX.Element
  trigger?: JSX.Element
}) {
  // Built on opening: DST-aware offsets for every zone are expensive. The title
  // is what search matches, so it holds the region and offset too.
  const options = computed(() => {
    if (!props.open) return []
    const zones = listTimeZones()
    const exclude = props.exclude ?? []
    const known = [props.value, ...(props.known ?? [])].filter(
      (zone): zone is string => !!zone && !zones.includes(zone),
    )
    return [...new Set(known), ...zones]
      .filter((zone) => !exclude.includes(zone))
      .map((zone) => {
        const city = timeZoneCity(zone)
        const offset = timeZoneOffsetLabel(zone, props.at)
        const region = zone.replaceAll("_", " ").replaceAll("/", " ")
        return { value: zone, title: `${city} ${region} ${offset}`, city, offset }
      })
      .sort((a, b) => a.city.localeCompare(b.city))
  })

  return (
    <Select
      class={props.class}
      triggerClass={props.triggerClass}
      popupClass={props.popupClass}
      items={options()}
      value={props.value ?? null}
      open={props.open}
      disabled={props.disabled}
      searchable
      searchPlaceholder="Search timezones"
      searchAccessibilityLabel="Search timezones"
      accessibilityLabel={props.accessibilityLabel ?? "Time zone"}
      empty={
        <Text class="px-2 py-6 text-center text-sm text-muted-foreground">No timezones found.</Text>
      }
      onOpenChange={(event) => props.onOpenChange(event.open)}
      onChange={(zone) => zone && zone !== props.value && props.onSelect(zone)}
      renderItem={(item) => {
        const option = options().find((candidate) => candidate.value === item.value)
        return (
          <View class="px-2 py-1.5">
            <TimeZoneLabel offset={option?.offset ?? ""} city={option?.city ?? item.title} />
          </View>
        )
      }}
      label={props.label}
      trigger={props.trigger}
    />
  )
}
