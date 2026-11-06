import { View } from "nsh"

import { CommandTooltip } from "@/components/shortcuts/CommandTooltip"
import { Button } from "@/components/ui/button"

import { SearchIcon } from "@/icons"
import { setSearchOpen } from "@/stores/commands"

/** The narrow window's search, in the sidebar's toolbar. */
export function SearchButton() {
  return (
    <View tooltip={<CommandTooltip text="Search" action="search.open" />}>
      <Button
        variant="secondary"
        size="icon"
        accessibilityLabel="Search"
        onPress={() => setSearchOpen(true)}
      >
        <SearchIcon />
      </Button>
    </View>
  )
}
