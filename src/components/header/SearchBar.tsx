import { format, parseISO } from "date-fns"
import { useEffect, useRef, useState } from "react"
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
        className="w-1 self-stretch shrink-0"
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
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const eventDetailRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverDismissedRef = useRef(false)
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map())

  const calendarSlugs = calendars.map((c) => c.slug)
  const hasResults = query.length >= 2 && results.length > 0

  useEffect(() => {
    itemRefs.current.get(focusedIndex)?.scrollIntoView({ block: "nearest" })
  }, [focusedIndex])

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
    setActiveEvent(null)
    setFocusedIndex(0)
    setIsExiting(true)
  }

  useOnClickOutside([containerRef, resultsRef, eventDetailRef], () => {
    if (isSearching) {
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
                  setActiveEvent(null)
                }}
                placeholder="Search events..."
                autoFocus={isSearching && !isExiting}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    if (popoverDismissedRef.current) {
                      popoverDismissedRef.current = false
                    } else {
                      close()
                    }
                  }
                  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && hasResults) {
                    e.preventDefault()
                    setFocusedIndex((i) =>
                      e.key === "ArrowDown"
                        ? i < results.length - 1
                          ? i + 1
                          : 0
                        : i > 0
                          ? i - 1
                          : results.length - 1,
                    )
                  }
                  if (e.key === "Enter" && hasResults) {
                    e.preventDefault()
                    const event = results[focusedIndex]
                    if (event) {
                      setActiveEvent((prev) => (prev?.id === event.id ? null : event))
                    }
                  }
                }}
                className={cn(
                  "border-none text-sm bg-secondary transition-[width] duration-200 ease-out",
                  isExiting ? "w-10" : "w-32 starting:w-10",
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
              ref={resultsRef}
              className="p-0 w-72"
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
                        onSelect={() =>
                          setActiveEvent((prev) => (prev?.id === event.id ? null : event))
                        }
                        className={cn(
                          "flex items-center gap-2 cursor-pointer",
                          isActive && "bg-accent!",
                        )}
                      >
                        <SearchResult event={event} color={calendarColor(event.calendar_slug)} />
                      </CommandItem>
                    )
                  })}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Popover
            open={!!activeEvent}
            onOpenChange={(open) => {
              if (!open) {
                popoverDismissedRef.current = true
                setActiveEvent(null)
              }
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
              ref={eventDetailRef}
              className="w-[350px] max-h-[80vh] overflow-y-auto p-0 shadow-2xl"
              side="right"
              align="start"
              sideOffset={8}
              collisionPadding={16}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <EditEvent event={activeEvent} />
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
