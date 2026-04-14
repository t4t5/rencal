import { SearchBar } from "@/components/search/SearchBar"
import { Button } from "@/components/ui/button"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"

import { InvitesDropdown } from "./InvitesDropdown"
import { SettingsButton } from "./SettingsButton"
import { SyncStatus } from "./SyncStatus"

export function HeaderLong() {
  const { navigateToDate } = useCalendarNavigation()

  return (
    <div className="shrink-0 flex gap-2 p-4">
      <div className="flex gap-2 items-center">
        <ShortcutTooltip text="Go to Today" shortcut="t">
          <Button variant="secondary" onClick={() => navigateToDate(new Date())}>
            Today
          </Button>
        </ShortcutTooltip>

        <SettingsButton />
        <InvitesDropdown />
        <SyncStatus />
      </div>

      <div className="grow h-full" data-tauri-drag-region />

      <TabsList onMouseDown={(e) => e.preventDefault()}>
        <ShortcutTooltip text="Week view" shortcut="w">
          <span>
            <TabsTrigger value="week">Week</TabsTrigger>
          </span>
        </ShortcutTooltip>
        <ShortcutTooltip text="Month view" shortcut="m">
          <span>
            <TabsTrigger value="month">Month</TabsTrigger>
          </span>
        </ShortcutTooltip>
      </TabsList>

      <SearchBar className="w-56 starting:w-56" eventPopoverSide="left" />
    </div>
  )
}
