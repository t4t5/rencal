import { SearchButton } from "@/components/header/search/SearchButton"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { useFullscreen } from "@/hooks/useFullscreen"
import { cn, isMacOS } from "@/lib/utils"

import { AddEventButton } from "./AddEventButton"
import { InvitesDropdown } from "./InvitesDropdown"
import { SettingsButton } from "./SettingsButton"
import { SyncStatus } from "./SyncStatus"

export function ActionBar() {
  const isMd = useBreakpoint("md")
  const isFullscreen = useFullscreen()

  return (
    <div
      className={cn("flex justify-between items-center gap-3 md:justify-end", {
        "pl-[78px]": isMacOS && !isFullscreen,
      })}
    >
      <AddEventButton />

      {!isMd && (
        <div className="flex gap-2 items-center">
          <SyncStatus className="pl-4" />
          <InvitesDropdown />
          <SettingsButton />
          <SearchButton />
        </div>
      )}
    </div>
  )
}
