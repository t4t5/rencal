import { InvitesBadge } from "@/components/toolbar/InvitesBadge"
import { ReportBugButton } from "@/components/toolbar/ReportBugButton"
import { SettingsButton } from "@/components/toolbar/SettingsButton"
import { SyncStatus } from "@/components/toolbar/SyncStatus"
import { SearchBar } from "@/components/toolbar/search/SearchBar"
import { Button } from "@/components/ui/button"
import { DragRegion } from "@/components/ui/drag-region"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"

import { CalendarView } from "@/lib/calendar-view"

import { CheckIcon } from "@/icons/check"
import { ChevronDownIcon } from "@/icons/chevron-down"

export function MainHeader({
  calendarView,
  onChangeCalendarView,
}: {
  calendarView: CalendarView
  onChangeCalendarView: (view: CalendarView) => void
}) {
  const { navigateToDate } = useCalendarNavigation()

  return (
    <div className="shrink-0 flex gap-2 p-4">
      <div className="flex gap-2 items-center">
        <ShortcutTooltip text="Go to Today" shortcut="t">
          <Button tabIndex={-1} variant="secondary" onClick={() => navigateToDate(new Date())}>
            Today
          </Button>
        </ShortcutTooltip>

        <SettingsButton />
        <InvitesBadge />
        <SyncStatus />
      </div>

      <DragRegion className="grow h-full" />

      <ReportBugButton />

      <CalendarViewDropdown
        calendarView={calendarView}
        onChangeCalendarView={onChangeCalendarView}
      />

      <SearchBar className="w-56 starting:w-56" eventPopoverSide="left" />
    </div>
  )
}

const CALENDAR_VIEW_OPTIONS: { view: CalendarView; name: string; shortcut: string }[] = [
  { view: "week", name: "Week", shortcut: "W" },
  { view: "month", name: "Month", shortcut: "M" },
  { view: "board", name: "Board", shortcut: "B" },
]

const CalendarViewDropdown = ({
  calendarView,
  onChangeCalendarView,
}: {
  calendarView: CalendarView
  onChangeCalendarView: (view: CalendarView) => void
}) => {
  const currentView = CALENDAR_VIEW_OPTIONS.find((option) => option.view === calendarView)

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button tabIndex={-1} variant="secondary" className="min-w-24 justify-between">
          {currentView?.name ?? "View"}
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {CALENDAR_VIEW_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.view}
            onSelect={() => onChangeCalendarView(option.view)}
            className="gap-3"
          >
            <span className="flex size-4 items-center justify-center">
              {calendarView === option.view && <CheckIcon className="size-4" />}
            </span>
            <span>{option.name}</span>
            <DropdownMenuShortcut>{option.shortcut}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
