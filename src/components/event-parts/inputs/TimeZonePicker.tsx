import { type ReactElement, useMemo, useState } from "react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { type EventTime, listTimeZones, timeZoneCity, timeZoneOffsetLabel } from "@/lib/event-time"
import { cn } from "@/lib/utils"

type TimeZoneOption = {
  tzid: string
  city: string
  offset: string
  searchText: string
}

function buildOptions(zones: string[], at: EventTime): TimeZoneOption[] {
  return zones
    .map((tzid) => {
      const city = timeZoneCity(tzid)
      const offset = timeZoneOffsetLabel(tzid, at)
      const region = tzid.replaceAll("_", " ").replaceAll("/", " ")
      return { tzid, city, offset, searchText: `${city} ${region} ${offset}`.toLowerCase() }
    })
    .sort((a, b) => a.city.localeCompare(b.city))
}

function filterOptions(options: TimeZoneOption[], query: string): TimeZoneOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options

  const prefixMatches: TimeZoneOption[] = []
  const otherMatches: TimeZoneOption[] = []
  for (const option of options) {
    if (option.city.toLowerCase().startsWith(q)) prefixMatches.push(option)
    else if (option.searchText.includes(q)) otherMatches.push(option)
  }
  return [...prefixMatches, ...otherMatches]
}

function withKnownZones(zones: string[], extra: string[]): string[] {
  const missing = extra.filter((tzid) => !zones.includes(tzid))
  return missing.length ? [...missing, ...zones] : zones
}

const NO_ZONES: readonly string[] = []

/**
 * A searchable list of timezones in a popover on its trigger, the only child.
 * Offsets are the zones' at `at`, since they change with daylight saving.
 */
export function TimeZonePicker({
  value,
  at,
  open,
  onOpenChange,
  onSelect,
  known = NO_ZONES,
  exclude = NO_ZONES,
  contentClassName,
  asAnchor = false,
  children,
}: {
  /** The zone chosen now, if any: the list opens on it. */
  value?: string
  at: EventTime
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (tzid: string) => void
  /** Zones to offer even where the runtime doesn't list them. */
  known?: readonly string[]
  /** Zones to leave out, e.g. ones already chosen elsewhere. */
  exclude?: readonly string[]
  contentClassName?: string
  /** Place the list on the child without opening it on click, e.g. a menu's trigger. */
  asAnchor?: boolean
  children: ReactElement
}) {
  const [query, setQuery] = useState("")
  const [highlighted, setHighlighted] = useState<string | undefined>(open ? value : undefined)

  // Build DST-aware offsets lazily because calculating every zone is expensive.
  const options = useMemo(() => {
    if (!open) return []
    const zones = withKnownZones(listTimeZones(), value ? [value, ...known] : [...known])
    return buildOptions(
      zones.filter((tzid) => !exclude.includes(tzid)),
      at,
    )
  }, [open, value, known, exclude, at])
  const filtered = filterOptions(options, query)

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    setQuery("")
    if (next) setHighlighted(value)
  }

  const handleQueryChange = (next: string) => {
    setQuery(next)
    const [best] = filterOptions(options, next)
    setHighlighted(next.trim() ? best?.tzid : value)
  }

  const commit = (tzid: string) => {
    if (tzid !== value) onSelect(tzid)
    handleOpenChange(false)
  }

  const Anchor = asAnchor ? PopoverAnchor : PopoverTrigger

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Anchor asChild>{children}</Anchor>

      <PopoverContent
        className={cn("p-0 w-(--radix-popover-trigger-width)", contentClassName)}
        align="start"
      >
        <Command shouldFilter={false} value={highlighted} onValueChange={setHighlighted}>
          <CommandInput
            placeholder="Search timezones"
            value={query}
            onValueChange={handleQueryChange}
          />
          <CommandList>
            {filtered.length ? (
              <CommandGroup>
                {filtered.map((option) => (
                  <CommandItem
                    key={option.tzid}
                    value={option.tzid}
                    onSelect={() => commit(option.tzid)}
                    className={cn(option.tzid === value && "font-medium")}
                  >
                    <TimeZoneLabel offset={option.offset} city={option.city} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <CommandEmpty>No timezones found.</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** "GMT+1 Stockholm", the offset set back from the city. */
export const TimeZoneLabel = ({
  offset,
  city,
  className,
}: {
  offset: string
  city: string
  className?: string
}) => (
  <span className={cn("flex min-w-0 items-baseline gap-1.5 text-left", className)}>
    <span className="shrink-0 text-muted-foreground">{offset}</span>
    <span className="truncate">{city}</span>
  </span>
)
