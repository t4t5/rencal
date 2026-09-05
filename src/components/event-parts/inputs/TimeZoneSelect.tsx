import { useMemo, useState } from "react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { InputGroupAddon } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownArrow } from "@/components/ui/select"

import { useViewerTzid } from "@/hooks/useViewerTzid"
import {
  type EventTime,
  eventTzid,
  listTimeZones,
  timeZoneCity,
  timeZoneOffsetLabel,
} from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { GlobeIcon } from "@/icons/globe"

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

  const [open, setOpen] = useState(defaultOpen)
  const [query, setQuery] = useState("")
  const [highlighted, setHighlighted] = useState<string | undefined>(defaultOpen ? tzid : undefined)

  // Build DST-aware offsets lazily because calculating every zone is expensive.
  const options = useMemo(
    () => (open ? buildOptions(withKnownZones(listTimeZones(), [tzid, viewerTzid]), value) : []),
    [open, tzid, viewerTzid, value],
  )
  const filtered = filterOptions(options, query)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    setQuery("")
    if (next) setHighlighted(tzid)
  }

  const handleQueryChange = (next: string) => {
    setQuery(next)
    const [best] = filterOptions(options, next)
    setHighlighted(next.trim() ? best?.tzid : tzid)
  }

  const commit = (nextTzid: string) => {
    if (nextTzid !== tzid) onChange(nextTzid)
    setOpen(false)
    setQuery("")
  }

  return (
    <Popover open={readOnly ? false : open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex h-control-height w-full min-w-0 items-center gap-2 rounded-md border border-transparent bg-transparent pl-0 pr-3 text-sm outline-none hover:border-input focus-visible:bg-secondary data-[state=open]:bg-secondary",
            readOnly && "pointer-events-none",
          )}
        >
          <InputGroupAddon>
            <GlobeIcon />
          </InputGroupAddon>
          <TimeZoneLabel
            offset={timeZoneOffsetLabel(tzid, value)}
            city={timeZoneCity(tzid)}
            className="grow"
          />
          {!readOnly && <DropdownArrow forceVisible={open} />}
        </button>
      </PopoverTrigger>

      <PopoverContent className="p-0 w-(--radix-popover-trigger-width)" align="start">
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
                    className={cn(option.tzid === tzid && "font-medium")}
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

const TimeZoneLabel = ({
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
