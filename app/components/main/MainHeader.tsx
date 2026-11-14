import { type JSX, Text, token, View } from "nsh"
import { titleBar } from "nsh/desktop"

import { CommandTooltip } from "@/components/shortcuts/CommandTooltip"
import { formatHotkeyKey } from "@/components/shortcuts/ShortcutKeys"
import { InvitesBadge } from "@/components/toolbar/InvitesBadge"
import { SyncStatus } from "@/components/toolbar/SyncStatus"
import { Button } from "@/components/ui/button"
import { Menu, MenuItem } from "@/components/ui/menu"

import { formatGroupName, getGroupOptions } from "@/lib/calendar-groups"
import { today } from "@/lib/event-time"
import { inspectable } from "@/lib/inspect"

import {
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SidebarIcon,
} from "@/icons"
import { activeGroup, navigateToDate, setActiveGroup } from "@/stores/calendar"
import { actionKeys, composeNewEvent, setSearchOpen } from "@/stores/commands"
import { groups } from "@/stores/settings"
import {
  calendarView,
  openSettings,
  setCalendarView,
  sidebarCollapsed,
  toggleSidebar,
} from "@/stores/view"
import { resolveView, VIEWS } from "@/views/manifest"

/** A dropdown with the look of the old select button. */
function SelectMenu(props: { label: string; children?: JSX.Element }) {
  return (
    <Menu
      align="end"
      popupClass="w-48"
      trigger={
        <View class="h-(--control-height) min-w-24 flex-row items-center justify-between gap-2 rounded-(--radius-md) bg-secondary hover:bg-secondary-hover px-3">
          <Text class="text-sm text-secondary-foreground">{props.label}</Text>
          <ChevronDownIcon class="size-3 shrink-0" color={String(token("muted-foreground"))} />
        </View>
      }
    >
      {props.children}
    </Menu>
  )
}

function CheckSlot(props: { checked: boolean }) {
  return (
    <View class="size-4 items-center justify-center">
      <If when={props.checked}>
        <CheckIcon class="size-4" />
      </If>
    </View>
  )
}

function CalendarViewDropdown() {
  const shortcut = (id: string) =>
    actionKeys(`view.switch:${id}`)?.split("+").map(formatHotkeyKey).join("+")
  return (
    <SelectMenu label={resolveView(calendarView()).name}>
      <Each of={VIEWS} key={(view) => view.id}>
        {(view) => (
          <MenuItem class="gap-3" onSelect={() => setCalendarView(view().id)}>
            <CheckSlot checked={resolveView(calendarView()).id === view().id} />
            <Text class="text-sm flex-1">{view().name}</Text>
            <If when={shortcut(view().id)}>
              {(keys) => <Text class="text-xs text-muted-foreground">{keys()}</Text>}
            </If>
          </MenuItem>
        )}
      </Each>
    </SelectMenu>
  )
}

/** Switches the active calendar group; hidden unless there are at least two. */
function GroupSwitcher() {
  const options = () => getGroupOptions(groups())
  return (
    <If when={options().length >= 2}>
      <SelectMenu label={formatGroupName(activeGroup())}>
        <Each of={options()}>
          {(name) => (
            <MenuItem class="gap-3" onSelect={() => setActiveGroup(name())}>
              <CheckSlot checked={activeGroup() === name()} />
              <Text class="text-sm flex-1">{formatGroupName(name())}</Text>
            </MenuItem>
          )}
        </Each>
      </SelectMenu>
    </If>
  )
}

/** Hides the sidebar as well as bringing it back, from the same place. */
function ToggleSidebarButton() {
  const label = () => (sidebarCollapsed() ? "Show sidebar" : "Hide sidebar")
  return (
    <View tooltip={<CommandTooltip text={label()} action="sidebar.toggle" />}>
      <Button variant="ghost" size="icon" accessibilityLabel={label()} onPress={toggleSidebar}>
        <SidebarIcon />
      </Button>
    </View>
  )
}

/** Stands in for the sidebar's compose button while the sidebar is hidden. */
function NewEventButton() {
  return (
    <If when={sidebarCollapsed()}>
      <View tooltip={<CommandTooltip text="Create new event" action="event.new" />}>
        <Button
          testID="toolbar-new-event"
          variant="ghost"
          size="icon"
          accessibilityLabel="Create new event"
          onPress={composeNewEvent}
        >
          <PlusIcon class="size-4" />
        </Button>
      </View>
    </If>
  )
}

export function MainHeader() {
  return (
    <View
      ref={inspectable("Main header", "components/main/MainHeader.tsx")}
      class="shrink-0 flex-row gap-2 p-(--layout-padding)"
      desktop={{ windowDrag: true }}
    >
      {/* With the sidebar hidden, this toolbar sits under the macOS traffic lights. */}
      <View
        class="flex-row gap-2 items-center"
        style={{ paddingLeft: sidebarCollapsed() ? titleBar().left : 0 }}
      >
        <ToggleSidebarButton />
        <NewEventButton />
        <View tooltip={<CommandTooltip text="Go to Today" action="date.today" />}>
          <Button variant="secondary" label="Today" onPress={() => navigateToDate(today())} />
        </View>
        <View tooltip={<CommandTooltip text="Settings" action="app.settings" />}>
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel="Settings"
            onPress={() => openSettings()}
          >
            <SettingsIcon />
          </Button>
        </View>
        <SyncStatus />
        <InvitesBadge />
      </View>
      <View class="flex-1" />
      <GroupSwitcher />
      <CalendarViewDropdown />
      <View tooltip={<CommandTooltip text="Search" action="search.open" />}>
        <Button
          variant="secondary"
          class="w-[260px] justify-start px-2"
          onPress={() => setSearchOpen(true)}
        >
          <SearchIcon />
          <Text class="text-sm text-muted-foreground flex-1">Search</Text>
          <Text class="font-mono text-xs text-muted-foreground">/</Text>
        </Button>
      </View>
    </View>
  )
}
