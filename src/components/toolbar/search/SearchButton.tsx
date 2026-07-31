import { useState } from "react"

import { Button } from "@/components/ui/button"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"

import { SearchIcon } from "@/icons/search"

import { SearchPalette } from "./SearchPalette"

export const SEARCH_BUTTON_EL_ID = "global-search-button"

export function SearchButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <ShortcutTooltip text="Search" shortcut="/">
        <Button
          id={SEARCH_BUTTON_EL_ID}
          size="icon"
          variant="secondary"
          tabIndex={-1}
          onClick={() => setOpen(true)}
        >
          <SearchIcon />
        </Button>
      </ShortcutTooltip>
      <SearchPalette open={open} onOpenChange={setOpen} />
    </>
  )
}
