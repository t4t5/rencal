import { useEffect, useMemo, useRef, useState } from "react"

import { SearchResultEventBlock } from "@/components/events-blocks/search-result/EventBlock"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { rpc } from "@/rpc"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { useVisibleCalendarIds } from "@/hooks/cal-events/useVisibleCalendarIds"
import { useDebouncedEffect } from "@/hooks/useDebouncedEffect"
import { useJumpToEvent } from "@/hooks/useJumpToEvent"
import { eventKey, rpcToCalendarEvents, type CalendarEvent } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { prepareSearchResults } from "@/lib/search-results"

export function SearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { calendars } = useCalendars()
  const { timeFormat } = useSettings()
  const visibleCalendarIds = useVisibleCalendarIds()
  const jumpToEvent = useJumpToEvent()

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const requestIdRef = useRef(0)
  const pendingRef = useRef<(() => void) | null>(null)
  const visibleCalendarKey = visibleCalendarIds.join("|")

  const calendarBySlug = useMemo(
    () => new Map(calendars.map((calendar) => [calendar.slug, calendar])),
    [calendars],
  )

  useEffect(() => {
    requestIdRef.current += 1

    if (!open) {
      setQuery("")
      setResults([])
      setIsLoading(false)
    }
  }, [open, query, visibleCalendarKey])

  useDebouncedEffect(
    () => {
      if (!open || query.length < 2 || visibleCalendarIds.length === 0) {
        setResults([])
        setIsLoading(false)
        return
      }

      const requestId = ++requestIdRef.current
      setIsLoading(true)

      void rpc.caldir
        .search_events(visibleCalendarIds, query)
        .then((found) => {
          if (requestId !== requestIdRef.current) return
          setResults(prepareSearchResults(rpcToCalendarEvents(found)))
        })
        .catch((error: unknown) => {
          if (requestId !== requestIdRef.current) return
          console.error("Event search failed:", error)
          setResults([])
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setIsLoading(false)
        })
    },
    [open, query, visibleCalendarKey],
    300,
  )

  const handleQueryChange = (nextQuery: string) => {
    requestIdRef.current += 1
    setQuery(nextQuery)
    setResults([])
    setIsLoading(nextQuery.length >= 2 && visibleCalendarIds.length > 0)
  }

  const selectEvent = (event: CalendarEvent) => {
    pendingRef.current = () => void jumpToEvent(event)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="mt-[20px] self-start gap-0 overflow-hidden p-0 sm:max-w-2xl"
        onCloseAutoFocus={(e) => {
          if (!pendingRef.current) return
          e.preventDefault()
          const action = pendingRef.current
          pendingRef.current = null
          action()
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search events</DialogTitle>
          <DialogDescription>Search visible calendars for an event</DialogDescription>
        </DialogHeader>

        <Command
          shouldFilter={false}
          className="[&_[data-slot=command-input-wrapper]]:h-12 [&_[data-slot=command-input-wrapper]>svg]:size-5 [&_[data-slot=command-input]]:h-12 [&_[data-slot=command-input]]:text-base"
        >
          <CommandInput
            placeholder="Search your events..."
            value={query}
            onValueChange={handleQueryChange}
            wrapperClassName={query.length < 2 || isLoading ? "border-b-0" : undefined}
            trailing={
              isLoading ? (
                <span
                  role="status"
                  aria-label="Searching events"
                  className="border-muted-foreground size-3.5 shrink-0 animate-spin rounded-full border-2 border-r-transparent"
                />
              ) : null
            }
          />

          {query.length >= 2 && (
            <CommandList className="max-h-[400px]">
              {!isLoading && results.length === 0 && <CommandEmpty>No events found.</CommandEmpty>}
              {results.map((event) => (
                <CommandItem
                  key={eventKey(event)}
                  value={eventKey(event)}
                  onSelect={() => selectEvent(event)}
                  className="flex items-center gap-2 px-3 py-1.5"
                >
                  <SearchResultEventBlock
                    event={event}
                    color={getCalendarColor(calendarBySlug.get(event.calendar_slug))}
                    timeFormat={timeFormat}
                  />
                </CommandItem>
              ))}
            </CommandList>
          )}
        </Command>
      </DialogContent>
    </Dialog>
  )
}
