import { useState } from "react"

import { Button } from "@/components/ui/button"

import { cn } from "@/lib/utils"

import { SearchIcon } from "@/icons/search"

import { SearchBar } from "./SearchBar"

export const SEARCH_BUTTON_EL_ID = "global-search-button"

// Make expanded input overlap the other action buttons on the left:
export function SearchButtonArea() {
  const [isSearching, setIsSearching] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  const showInput = isSearching || isExiting

  return (
    <div
      className={cn("absolute inset-0 flex justify-end transition duration-75", {
        "bg-transparent left-auto": !showInput,
        "bg-background left-0": showInput,
      })}
    >
      {showInput ? (
        <SearchBar
          isSearching={isSearching}
          isExiting={isExiting}
          setIsExiting={setIsExiting}
          setIsSearching={setIsSearching}
          onClose={() => setIsExiting(true)}
          showShortcut={false}
        />
      ) : (
        <Button id={SEARCH_BUTTON_EL_ID} variant="secondary" onClick={() => setIsSearching(true)}>
          <SearchIcon />
        </Button>
      )}
    </div>
  )
}
