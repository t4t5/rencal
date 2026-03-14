import { format, parseISO } from "date-fns"
import { useRef, useState } from "react"
import { IoSearch as SearchIcon } from "react-icons/io5"

import { EditEvent } from "@/components/event-info/EditEvent"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

import { rpc } from "@/rpc"
import type { CalendarEvent } from "@/rpc/bindings"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useDebouncedEffect } from "@/hooks/useDebouncedEffect"
import { useOnClickOutside } from "@/hooks/useOnClickOutside"
import { formatShortDate } from "@/lib/time"
import { cn } from "@/lib/utils"

function SearchResult({ event, color }: { event: CalendarEvent; color: string | null }) {
  return (
    <>
      <div
        className="w-1 self-stretch rounded shrink-0"
        style={{ backgroundColor: color ?? "var(--primary)" }}
      />
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">{event.summary}</div>
        <div className="text-xs text-muted-foreground">
          {event.all_day
            ? formatShortDate(parseISO(event.start))
            : `${formatShortDate(parseISO(event.start))} · ${format(parseISO(event.start), "HH:mm")}`}
        </div>
      </div>
    </>
  )
}

export function SearchBar() {
  const { calendars } = useCalendarState()

  const [isSearching, setIsSearching] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const calendarSlugs = calendars.map((c) => c.slug)
  const hasResults = query.length >= 2 && results.length > 0

  // Debounced search (min 2 chars)
  useDebouncedEffect(
    () => {
      if (query.length < 2) {
        setResults([])
        return
      }

      setIsLoading(true)
      void rpc.caldir.search_events(calendarSlugs, query).then((found) => {
        setResults(found)
        setIsLoading(false)
      })
    },
    [query],
    300,
  )

  const close = () => {
    setQuery("")
    setResults([])
    setSelectedEvent(null)
    setIsExiting(true)
  }

  useOnClickOutside(containerRef, () => {
    if (isSearching && query === "" && !selectedEvent) {
      close()
    }
  })

  const showInput = isSearching || isExiting

  const calendarColor = (slug: string) => calendars.find((c) => c.slug === slug)?.color ?? null

  return (
    <div ref={containerRef}>
      {showInput ? (
        <>
          <Popover open={hasResults}>
            <PopoverAnchor asChild>
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSelectedEvent(null)
                }}
                placeholder="Search events..."
                autoFocus={isSearching && !isExiting}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    close()
                  }
                }}
                className={cn(
                  "border-none text-sm bg-secondary transition-[width] duration-200 ease-out",
                  isExiting ? "w-10" : "w-full starting:w-10",
                )}
                onTransitionEnd={() => {
                  if (isExiting) {
                    setIsExiting(false)
                    setIsSearching(false)
                  }
                }}
              />
            </PopoverAnchor>
            <PopoverContent
              className="p-0 w-72"
              align="end"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => {
                if (containerRef.current?.contains(e.target as Node)) {
                  e.preventDefault()
                }
              }}
            >
              <Command>
                <CommandList>
                  {results.length === 0 && query.length >= 2 && !isLoading && (
                    <CommandEmpty>No events found.</CommandEmpty>
                  )}
                  {results.map((event) => (
                    <CommandItem
                      key={`${event.calendar_slug}-${event.id}`}
                      onSelect={() => setSelectedEvent(event)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <SearchResult event={event} color={calendarColor(event.calendar_slug)} />
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Popover
            open={!!selectedEvent}
            onOpenChange={(open) => {
              if (!open) setSelectedEvent(null)
            }}
          >
            <PopoverAnchor asChild>
              <div
                className="fixed pointer-events-none"
                ref={(el) => {
                  if (!el || !inputRef.current) return
                  const rect = inputRef.current.getBoundingClientRect()
                  el.style.top = `${rect.top + rect.height / 2}px`
                  el.style.left = `${rect.right}px`
                }}
              />
            </PopoverAnchor>
            <PopoverContent
              className="w-[350px] max-h-[80vh] overflow-y-auto p-0 shadow-2xl"
              side="right"
              align="start"
              sideOffset={8}
              collisionPadding={16}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <EditEvent event={selectedEvent} />
            </PopoverContent>
          </Popover>
        </>
      ) : (
        <Button variant="secondary" onClick={() => setIsSearching(true)}>
          <SearchIcon />
        </Button>
      )}
    </div>
  )
}
