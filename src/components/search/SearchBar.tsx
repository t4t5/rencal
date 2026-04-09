import { useEffect, useRef, useState } from "react"

import { Popover, PopoverAnchor } from "@/components/ui/popover"

import { rpc } from "@/rpc"
import type { CalendarEvent } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"

import { useDebouncedEffect } from "@/hooks/useDebouncedEffect"
import { useOnClickOutside } from "@/hooks/useOnClickOutside"

import { EventPopover } from "./EventPopover"
import { SearchInput } from "./SearchInput"
import { SearchResults } from "./SearchResults"

interface SearchBarProps {
  isSearching?: boolean
  isExiting?: boolean
  setIsExiting?: (v: boolean) => void
  setIsSearching?: (v: boolean) => void
  onClose?: () => void
  className?: string
  eventPopoverSide?: "left" | "right"
}

export function SearchBar({
  isSearching = false,
  isExiting = false,
  setIsExiting = () => {},
  setIsSearching = () => {},
  onClose,
  className,
  eventPopoverSide,
}: SearchBarProps = {}) {
  const { calendars } = useCalendars()

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

  const close = () => {
    setQuery("")
    setResults([])
    setActiveEvent(null)
    setFocusedIndex(0)
    inputRef.current?.blur()
    onClose?.()
  }

  // Close search on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (!query && !activeEvent && !onClose) return
      if (
        eventDetailRef.current?.contains(document.activeElement) &&
        document.activeElement?.matches("input, textarea, select")
      ) {
        return
      }
      if (popoverDismissedRef.current) {
        popoverDismissedRef.current = false
        return
      }
      close()
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [query, activeEvent, onClose])

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

  useOnClickOutside([containerRef, resultsRef, eventDetailRef], () => {
    if (query || activeEvent || onClose) {
      close()
    }
  })

  const calendarColor = (slug: string) => calendars.find((c) => c.slug === slug)?.color ?? null

  return (
    <div ref={containerRef}>
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
            className={className}
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
        side={eventPopoverSide}
      />
    </div>
  )
}
