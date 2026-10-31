import { useState } from "react"

import { CommandTooltip } from "@/components/shortcuts/CommandTooltip"
import { Button } from "@/components/ui/button"

import { SearchIcon } from "@/icons/search"

import { SearchPalette } from "./SearchPalette"

export const SEARCH_BUTTON_EL_ID = "global-search-button"

export function SearchButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <CommandTooltip text="Search" action="search.open">
        <Button
          id={SEARCH_BUTTON_EL_ID}
          size="icon"
          variant="secondary"
          tabIndex={-1}
          onClick={() => setOpen(true)}
        >
          <SearchIcon />
        </Button>
      </CommandTooltip>
      <SearchPalette open={open} onOpenChange={setOpen} />
    </>
  )
}
