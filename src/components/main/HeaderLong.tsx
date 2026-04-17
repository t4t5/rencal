import { InvitesDropdown } from "@/components/header-parts/InvitesDropdown"
import { SettingsButton } from "@/components/header-parts/SettingsButton"
import { SyncStatus } from "@/components/header-parts/SyncStatus"
import { SearchBar } from "@/components/header-parts/search/SearchBar"
import { Button } from "@/components/ui/button"
import { DragRegion } from "@/components/ui/drag-region"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"

import { CalendarView } from "@/lib/calendar-view"

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

      <DragRegion className="grow h-full" />

      <TabsList onMouseDown={(e) => e.preventDefault()}>
        <CalendarViewTab view="week" name="Week" shortcut="w" />
        <CalendarViewTab view="month" name="Month" shortcut="m" />
      </TabsList>

      <SearchBar className="w-56 starting:w-56" eventPopoverSide="left" />
    </div>
  )
}

const CalendarViewTab = ({
  view,
  name,
  shortcut,
}: {
  view: CalendarView
  name: string
  shortcut: string
}) => {
  return (
    <ShortcutTooltip text={`${name} view`} shortcut={shortcut}>
      <span className="h-full">
        <TabsTrigger value={view}>{name}</TabsTrigger>
      </span>
    </ShortcutTooltip>
  )
}
