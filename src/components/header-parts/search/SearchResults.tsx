import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"

import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command"
import { PopoverContent } from "@/components/ui/popover"

import type { TimeFormat } from "@/rpc/bindings"

import { useSettings } from "@/contexts/SettingsContext"

import type { CalendarEvent } from "@/lib/cal-events"
import { formatShortDate, formatTime, isAllDay } from "@/lib/event-time"
import { cn } from "@/lib/utils"

function SearchResult({
  event,
  color,
  timeFormat,
}: {
  event: CalendarEvent
  color: string | null
  timeFormat: TimeFormat
}) {
  return (
    <>
      <div
        className="w-1 self-stretch shrink-0"
        style={{ backgroundColor: color ?? "var(--primary)" }}
      />
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">{event.summary}</div>
        <div className="text-xs text-muted-foreground">
          {isAllDay(event.start)
            ? formatShortDate(event.start)
            : `${formatShortDate(event.start)} · ${formatTime(event.start, timeFormat)}`}
        </div>
      </div>
    </>
  )
}

interface SearchResultsProps {
  resultsRef: RefObject<HTMLDivElement | null>
  containerRef: RefObject<HTMLDivElement | null>
  results: CalendarEvent[]
  query: string
  isLoading: boolean
  activeEvent: CalendarEvent | null
  setActiveEvent: Dispatch<SetStateAction<CalendarEvent | null>>
  focusedIndex: number
  setFocusedIndex: Dispatch<SetStateAction<number>>
  itemRefs: MutableRefObject<Map<number, HTMLElement>>
  calendarColor: (slug: string) => string | null
}

export function SearchResults({
  resultsRef,
  containerRef,
  results,
  query,
  isLoading,
  activeEvent,
  setActiveEvent,
  focusedIndex,
  setFocusedIndex,
  itemRefs,
  calendarColor,
}: SearchResultsProps) {
  const { timeFormat } = useSettings()

  return (
    <PopoverContent
      ref={resultsRef}
      className="p-0 w-72 ml-1.5 z-40"
      align="end"
      onOpenAutoFocus={(e) => e.preventDefault()}
      onInteractOutside={(e) => {
        if (containerRef.current?.contains(e.target as Node)) {
          e.preventDefault()
        }
      }}
    >
      <Command
        shouldFilter={false}
        value={String(focusedIndex)}
        onValueChange={(v) => setFocusedIndex(Number(v))}
      >
        <CommandList>
          {results.length === 0 && query.length >= 2 && !isLoading && (
            <CommandEmpty>No events found.</CommandEmpty>
          )}
          {results.map((event, index) => {
            const isActive = activeEvent?.id === event.id
            return (
              <CommandItem
                key={`${event.calendar_slug}-${event.id}`}
                value={String(index)}
                ref={(el) => {
                  if (el) itemRefs.current.set(index, el)
                  else itemRefs.current.delete(index)
                }}
                onSelect={() => setActiveEvent((prev) => (prev?.id === event.id ? null : event))}
                className={cn("flex items-center gap-2 cursor-pointer", isActive && "bg-accent!")}
              >
                <SearchResult
                  event={event}
                  color={calendarColor(event.calendar_slug)}
                  timeFormat={timeFormat}
                />
              </CommandItem>
            )
          })}
        </CommandList>
      </Command>
    </PopoverContent>
  )
}
