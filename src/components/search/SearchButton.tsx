import { useState } from "react"
import { IoSearch as SearchIcon } from "react-icons/io5"

import { Button } from "@/components/ui/button"

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
    />
  ) : (
    <Button variant="secondary" onClick={() => setIsSearching(true)}>
      <SearchIcon />
    </Button>
  )
}
