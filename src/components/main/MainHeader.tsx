import { InvitesBadge } from "@/components/toolbar/InvitesBadge"
import { SettingsButton } from "@/components/toolbar/SettingsButton"
import { SyncStatus } from "@/components/toolbar/SyncStatus"
import { ToggleSidebarButton } from "@/components/toolbar/ToggleSidebarButton"
import { SearchButton } from "@/components/toolbar/search/SearchButton"
import { Button } from "@/components/ui/button"
import { DragRegion } from "@/components/ui/drag-region"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SelectButton } from "@/components/ui/select"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"

import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { formatGroupName, getGroupOptions } from "@/lib/calendar-groups"
import { today } from "@/lib/event-time"

import { CheckIcon } from "@/icons/check"
import type { ViewDescriptor } from "@/views/manifest"
import { useViews } from "@/views/useViews"

export function MainHeader({
  activeView,
  onChangeCalendarView,
}: {
  activeView: ViewDescriptor
  onChangeCalendarView: (view: string) => void
}) {
  const { navigateToDate } = useCalendarNavigation()

  return (
    <div data-slot="main-toolbar" className="shrink-0 flex gap-2 p-(--layout-padding)">
      <div className="flex gap-2 items-center">
        <ToggleSidebarButton />

        <ShortcutTooltip text="Go to Today" shortcut="t">
          <Button tabIndex={-1} variant="secondary" onClick={() => navigateToDate(today())}>
            Today
          </Button>
        </ShortcutTooltip>

        <SettingsButton />
        <InvitesBadge />
        <SyncStatus />
      </div>

      <DragRegion className="grow h-full" />

      <GroupSwitcher />

      <CalendarViewDropdown activeView={activeView} onChangeCalendarView={onChangeCalendarView} />

      <SearchButton />
    </div>
  )
}

const CalendarViewDropdown = ({
  activeView,
  onChangeCalendarView,
}: {
  activeView: ViewDescriptor
  onChangeCalendarView: (view: string) => void
}) => {
  const views = useViews()

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <SelectButton tabIndex={-1}>{activeView.name}</SelectButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {views.map((view) => (
          <DropdownMenuItem
            key={view.id}
            onSelect={() => onChangeCalendarView(view.id)}
            className="gap-3"
          >
            <span className="flex size-4 items-center justify-center">
              {activeView.id === view.id && <CheckIcon className="size-4" />}
            </span>
            <span>{view.name}</span>
            <DropdownMenuShortcut>{view.shortcut?.toUpperCase()}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Switches the active calendar group (app state).
// Hidden unless there are at least 2 groups to switch between.
const GroupSwitcher = () => {
  const { activeGroup, setActiveGroup } = useCalendars()
  const { groups } = useSettings()

  const options = getGroupOptions(groups)
  if (options.length < 2) return null

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <SelectButton tabIndex={-1}>{formatGroupName(activeGroup)}</SelectButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        {options.map((name) => (
          <DropdownMenuItem key={name} onSelect={() => setActiveGroup(name)} className="gap-3">
            <span className="flex size-4 items-center justify-center">
              {activeGroup === name && <CheckIcon className="size-4" />}
            </span>

            <span>{formatGroupName(name)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
