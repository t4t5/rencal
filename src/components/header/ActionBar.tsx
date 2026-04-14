import { SearchButton } from "@/components/search/SearchButton"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { cn, isMacOS } from "@/lib/utils"

import { AddEventButton } from "./AddEventButton"
import { InvitesDropdown } from "./InvitesDropdown"
import { SettingsButton } from "./SettingsButton"
import { SyncStatus } from "./SyncStatus"

export function ActionBar() {
  const isMd = useBreakpoint("md")

  return (
    <div
      className={cn("flex justify-between items-center gap-3", {
        "pl-[78px]": isMacOS,
      })}
    >
      <AddEventButton />

      {!isMd && (
        <div className="flex gap-2 items-center">
          <SyncStatus />
          <InvitesDropdown />
          <SettingsButton />
          <SearchButton />
        </div>
      )}
    </div>
  )
}
