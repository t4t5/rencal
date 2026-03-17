import { useEffect, useRef, useState } from "react"
import { IoSearch as SearchIcon } from "react-icons/io5"

import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor } from "@/components/ui/popover"

import { rpc } from "@/rpc"
import type { CalendarEvent } from "@/rpc/bindings"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useDebouncedEffect } from "@/hooks/useDebouncedEffect"
import { useOnClickOutside } from "@/hooks/useOnClickOutside"

import { EventPopover } from "./EventPopover"
import { SearchInput } from "./SearchInput"
import { SearchResults } from "./SearchResults"

export function SearchButton() {
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

  // Close search on Escape regardless of focus
  useEffect(() => {
    if (!isSearching) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      // Don't intercept if an input inside the event detail has focus
      if (
        eventDetailRef.current?.contains(document.activeElement) &&
        document.activeElement?.matches("input, textarea, select")
      ) {
        return
      }
      // Radix fires onOpenChange in capture phase before this bubble listener,
      // setting the ref to signal that the event detail was just dismissed
      if (popoverDismissedRef.current) {
        popoverDismissedRef.current = false
        return
      }

      close()
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isSearching])

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
            <PopoverAnchor>
              <SearchInput
                inputRef={inputRef}
                query={query}
                setQuery={setQuery}
                isSearching={isSearching}
                isExiting={isExiting}
                setIsExiting={setIsExiting}
                setIsSearching={setIsSearching}
                hasResults={hasResults}
                results={results}
                focusedIndex={focusedIndex}
                setFocusedIndex={setFocusedIndex}
                setActiveEvent={setActiveEvent}
              />
            </PopoverAnchor>
            <SearchResults
              resultsRef={resultsRef}
              containerRef={containerRef}
              results={results}
              query={query}
              isLoading={isLoading}
              activeEvent={activeEvent}
              setActiveEvent={setActiveEvent}
              focusedIndex={focusedIndex}
              setFocusedIndex={setFocusedIndex}
              itemRefs={itemRefs}
              calendarColor={calendarColor}
            />
          </Popover>

          <EventPopover
            activeEvent={activeEvent}
            setActiveEvent={setActiveEvent}
            popoverDismissedRef={popoverDismissedRef}
            inputRef={inputRef}
            eventDetailRef={eventDetailRef}
            resultsRef={resultsRef}
          />
        </>
      ) : (
        <Button variant="secondary" onClick={() => setIsSearching(true)}>
          <SearchIcon />
        </Button>
      )}
    </div>
  )
}
