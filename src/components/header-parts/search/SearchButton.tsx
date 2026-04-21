import { useState } from "react"

import { Button } from "@/components/ui/button"

import { SearchIcon } from "@/icons/search"

import { SearchBar } from "./SearchBar"

export function SearchButton() {
  const [isSearching, setIsSearching] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  const showInput = isSearching || isExiting

  return showInput ? (
    <SearchBar
      isSearching={isSearching}
      isExiting={isExiting}
      setIsExiting={setIsExiting}
      setIsSearching={setIsSearching}
      onClose={() => setIsExiting(true)}
      showShortcut={false}
    />
  ) : (
    <Button variant="secondary" onClick={() => setIsSearching(true)}>
      <SearchIcon />
    </Button>
  )
}
