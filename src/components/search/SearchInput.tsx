import { type Dispatch, type RefObject, type SetStateAction, useState } from "react"
import { IoSearch as SearchIcon } from "react-icons/io5"

import { Input } from "@/components/ui/input"
import { ShortcutKey } from "@/components/ui/shortcut-tooltip"

import type { CalendarEvent } from "@/rpc/bindings"

import { cn } from "@/lib/utils"

export const SEARCH_INPUT_EL_ID = "global-search"

interface SearchInputProps {
  inputRef: RefObject<HTMLInputElement | null>
  query: string
  setQuery: (query: string) => void
  isSearching: boolean
  isExiting: boolean
  setIsExiting: (v: boolean) => void
  setIsSearching: (v: boolean) => void
  hasResults: boolean
  results: CalendarEvent[]
  focusedIndex: number
  setFocusedIndex: Dispatch<SetStateAction<number>>
  setActiveEvent: Dispatch<SetStateAction<CalendarEvent | null>>
  className?: string
}

export function SearchInput({
  inputRef,
  query,
  setQuery,
  isSearching,
  isExiting,
  setIsExiting,
  setIsSearching,
  hasResults,
  results,
  focusedIndex,
  setFocusedIndex,
  setActiveEvent,
  className,
}: SearchInputProps) {
  const [isFocused, setIsFocused] = useState(false)

  return (
    <div className="relative">
      <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <ShortcutKey
        shortcut="/"
        className={cn(
          "absolute right-1.5 top-1/2 -translate-y-1/2 py-0 bg-buttonSecondaryBgHover transition-opacity duration-75",
          {
            "opacity-0": isFocused,
          },
        )}
      />
      <Input
        id={SEARCH_INPUT_EL_ID}
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActiveEvent(null)
        }}
        placeholder="Search"
        autoFocus={isSearching && !isExiting}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={(e) => {
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
          "border-none text-sm bg-secondary shadow-buttonBorder transition-[width] duration-200 ease-out pl-8",
          isExiting ? "w-10" : "w-32 starting:w-10",
          className,
        )}
        onTransitionEnd={() => {
          if (isExiting) {
            setIsExiting(false)
            setIsSearching(false)
          }
        }}
      />
    </div>
  )
}
