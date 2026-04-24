import { SearchButtonArea } from "@/components/header-parts/search/SearchButton"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { useFullscreen } from "@/hooks/useFullscreen"
import { cn, isMacOS } from "@/lib/utils"

import { DragRegion } from "../ui/drag-region"
import { AddEventButton } from "./AddEventButton"
import { InvitesDropdown } from "./InvitesDropdown"
import { SettingsButton } from "./SettingsButton"
import { SyncStatus } from "./SyncStatus"

export function ActionBar() {
  const isMd = useBreakpoint("md")
  const isFullscreen = useFullscreen()

  return (
    <div
      className={cn("flex justify-end items-center gap-3 md:justify-end relative", {
        "pl-[78px] md:pl-0": isMacOS && !isFullscreen,
      })}
    >
      <AddEventButton />

      {!isMd && <DragRegion className="grow" />}

      {!isMd && (
        <div className="flex gap-2 items-center">
          <SyncStatus />
          <InvitesDropdown />
          <SettingsButton />

          <div className="w-10" />

          <SearchButtonArea />
        </div>
      )}
    </div>
  )
}
