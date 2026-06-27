import { addDays, addMonths, isSameDay, startOfMonth, subDays, subMonths } from "date-fns"
import { useRef, useState } from "react"
import { useHotkeys } from "react-hotkeys-hook"

import { CommandPalette } from "@/components/shortcuts/CommandPalette"
import { ShortcutsOverlay } from "@/components/shortcuts/ShortcutsOverlay"
import {
  clearRememberedAgendaItem,
  focusAgendaItem,
  isAgendaItemFocused,
  isInteractiveElementFocused,
} from "@/components/sidebar/agenda/useAgendaKeyboardNav"
import { openSettingsWindow } from "@/components/toolbar/SettingsButton"
import { SEARCH_BUTTON_EL_ID } from "@/components/toolbar/search/SearchButton"
import { SEARCH_INPUT_EL_ID } from "@/components/toolbar/search/SearchInput"

import { useAgendaSelection } from "@/contexts/AgendaFocusContext"
import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"
import { useSettings } from "@/contexts/SettingsContext"

import { useOpenDayDraft } from "@/hooks/useOpenDayDraft"
import { useTheme } from "@/hooks/useTheme"
import { ACTIVE_DAY_EL_ID, getLastEventEndTime } from "@/lib/active-day-draft"
import { type CalendarGroups, formatGroupName, getGroupOptions } from "@/lib/calendar-groups"
import { CalendarView } from "@/lib/calendar-view"
import { type PaletteSubmenu, type SubmenuConfig } from "@/lib/palette-commands"
import { ShortcutBinding, ShortcutId, SHORTCUTS } from "@/lib/shortcuts"

import { useThemeRegistry } from "@/themes/ThemeRegistry"

const NAV_THROTTLE_MS = 80

type ShortcutHandler = (e?: KeyboardEvent) => void

// Isolated so context updates in the shortcut handlers don't re-render <App />.
export function GlobalShortcuts({
  onChangeCalendarView,
}: {
  onChangeCalendarView: (view: CalendarView) => void
}) {
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const { theme, setTheme, toggleTheme } = useTheme()
  const { descriptors } = useThemeRegistry()
  const { groups } = useSettings()
  const { activeGroup, setActiveGroup } = useCalendars()

  const handlers = useShortcutHandlers({
    onChangeCalendarView,
    openShortcutsOverlay: () => setOverlayOpen(true),
    toggleCommandPalette: () => setPaletteOpen((open) => !open),
    toggleTheme,
    groups,
    activeGroup,
    setActiveGroup,
  })

  const groupOptions = getGroupOptions(groups)

  // Each maps a `submenu` id to the list its command drills into. Group is
  // omitted when there's nothing to switch between, hiding its root command.
  const submenus: Partial<Record<PaletteSubmenu, SubmenuConfig>> = {
    theme: {
      heading: "Theme",
      placeholder: "Search themes…",
      empty: "No themes found.",
      items: descriptors.map((d) => ({ id: d.id, label: d.name })),
      activeId: theme,
      onSelect: setTheme,
    },
  }
  if (groupOptions.length >= 2) {
    submenus.group = {
      heading: "Group",
      placeholder: "Search groups…",
      empty: "No groups found.",
      items: groupOptions.map((name) => ({ id: name, label: formatGroupName(name) })),
      activeId: activeGroup,
      onSelect: setActiveGroup,
    }
  }

  return (
    <>
      {SHORTCUTS.flatMap((shortcut) =>
        shortcut.bindings.map((binding: ShortcutBinding) =>
          binding.type === "char" ? (
            <CharBindingHost
              key={`${shortcut.id}:${binding.keys}`}
              char={binding.keys}
              allowShift={binding.allowShift}
              onTrigger={handlers[shortcut.id]}
            />
          ) : (
            <HotkeyBindingHost
              key={`${shortcut.id}:${binding.keys}`}
              keys={binding.keys}
              enableOnFormTags={binding.enableOnFormTags}
              onTrigger={handlers[shortcut.id]}
            />
          ),
        ),
      )}

      <ShortcutsOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        handlers={handlers}
        submenus={submenus}
      />
    </>
  )
}

function useShortcutHandlers({
  onChangeCalendarView,
  openShortcutsOverlay,
  toggleCommandPalette,
  toggleTheme,
  groups,
  activeGroup,
  setActiveGroup,
}: {
  onChangeCalendarView: (view: CalendarView) => void
  openShortcutsOverlay: () => void
  toggleCommandPalette: () => void
  toggleTheme: () => void
  groups: CalendarGroups
  activeGroup: string
  setActiveGroup: (name: string) => void
}): Record<ShortcutId, ShortcutHandler> {
  const { activeDate, navigateToDate } = useCalendarNavigation()
  const { setSelectedEventKey } = useAgendaSelection()
  const { activeEvent, calendarEvents } = useCalEvents()
  const { draftPopoverOpen, setIsDrafting, setDefaultDraftEvent } = useEventDraft()
  const { canCreate, promptToConnect } = useCreateEventGate()
  const openDayDraft = useOpenDayDraft()

  const lastNavRef = useRef(0)

  const clearAgendaFocus = () => {
    if (!isAgendaItemFocused()) return
    clearRememberedAgendaItem()
    setSelectedEventKey(null)
    const activeElement = document.activeElement as HTMLElement | null
    activeElement?.blur()
  }

  const throttledNavigate = (date: Date) => {
    const now = Date.now()
    if (now - lastNavRef.current < NAV_THROTTLE_MS) return
    lastNavRef.current = now
    clearAgendaFocus()
    void navigateToDate(date)
  }

  const navigateToPreviousMonthStart = () => {
    const monthStart = startOfMonth(activeDate)
    throttledNavigate(isSameDay(activeDate, monthStart) ? subMonths(monthStart, 1) : monthStart)
  }

  const navigateToNextMonthStart = () => {
    throttledNavigate(startOfMonth(addMonths(activeDate, 1)))
  }

  const handleSearch = (e?: KeyboardEvent) => {
    e?.preventDefault()

    const input = document.getElementById(SEARCH_INPUT_EL_ID) as HTMLInputElement | null

    if (input) {
      input.focus()
      return
    }

    const button = document.getElementById(SEARCH_BUTTON_EL_ID) as HTMLButtonElement | null
    button?.click()
  }

  const handleComposeEvent = (e?: KeyboardEvent) => {
    e?.preventDefault()

    if (!canCreate) {
      promptToConnect()
      return
    }

    setDefaultDraftEvent()
    setIsDrafting(true)
  }

  const handleAddEventToActiveDay = (e?: KeyboardEvent) => {
    e?.preventDefault()
    const el = document.getElementById(ACTIVE_DAY_EL_ID)
    if (!el) return
    openDayDraft(activeDate, el, { start: getLastEventEndTime(activeDate, calendarEvents) })
  }

  const switchGroup = (e?: KeyboardEvent) => {
    const options = getGroupOptions(groups)
    if (options.length < 2) return

    e?.preventDefault()
    const activeIndex = options.indexOf(activeGroup)
    const nextIndex = activeIndex === -1 ? 0 : (activeIndex + 1) % options.length
    setActiveGroup(options[nextIndex])
  }

  return {
    today: () => {
      clearAgendaFocus()
      void navigateToDate(new Date())
    },
    "prev-day": () => throttledNavigate(subDays(activeDate, 1)),
    "next-day": () => throttledNavigate(addDays(activeDate, 1)),
    "prev-week": () => throttledNavigate(subDays(activeDate, 7)),
    "next-week": () => throttledNavigate(addDays(activeDate, 7)),
    "prev-month": navigateToPreviousMonthStart,
    "next-month": navigateToNextMonthStart,
    "prev-event": (e) => {
      if (activeEvent || draftPopoverOpen || isInteractiveElementFocused()) return
      e?.preventDefault()
      focusAgendaItem(-1, activeDate)
    },
    "next-event": (e) => {
      if (activeEvent || draftPopoverOpen || isInteractiveElementFocused()) return
      e?.preventDefault()
      focusAgendaItem(1, activeDate)
    },
    month: () => onChangeCalendarView("month"),
    week: () => onChangeCalendarView("week"),
    board: () => onChangeCalendarView("board"),
    "switch-group": switchGroup,
    search: handleSearch,
    "compose-event": handleComposeEvent,
    "add-event": handleAddEventToActiveDay,
    settings: (e) => {
      e?.preventDefault()
      void openSettingsWindow()
    },
    "toggle-theme": (e) => {
      e?.preventDefault()
      toggleTheme()
    },
    shortcuts: (e) => {
      e?.preventDefault()
      openShortcutsOverlay()
    },
    "command-palette": (e) => {
      e?.preventDefault()
      toggleCommandPalette()
    },
  }
}

function CharBindingHost({
  char,
  allowShift,
  onTrigger,
}: {
  char: string
  allowShift?: boolean
  onTrigger: ShortcutHandler
}) {
  useCharHotkey(char, onTrigger, { allowShift })
  return null
}

function HotkeyBindingHost({
  keys,
  enableOnFormTags,
  onTrigger,
}: {
  keys: string
  enableOnFormTags?: boolean
  onTrigger: ShortcutHandler
}) {
  useHotkeys(keys, onTrigger, { enableOnFormTags })
  return null
}

// Makes sure that single key shortcuts (like "C")
// work regardless of keyboard layout (QWERTY, AZERTY, etc)
function useCharHotkey(
  char: string,
  handler: ShortcutHandler,
  { allowShift = false }: { allowShift?: boolean } = {},
) {
  useHotkeys(
    char,
    (e) => {
      if (e.key.toLowerCase() !== char) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (!allowShift && e.shiftKey) return
      handler(e)
    },
    { useKey: true },
  )
}
