import { AddEventButton } from "@/components/toolbar/AddEventButton"
import { InvitesDropdown } from "@/components/toolbar/InvitesDropdown"
import { SettingsButton } from "@/components/toolbar/SettingsButton"
import { SyncStatus } from "@/components/toolbar/SyncStatus"
import { SearchButtonArea } from "@/components/toolbar/search/SearchButton"
import { DragRegion } from "@/components/ui/drag-region"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { useFullscreen } from "@/hooks/useFullscreen"
import { cn, isMacOS } from "@/lib/utils"

export function SidebarToolbar() {
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
