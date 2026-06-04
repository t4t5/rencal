import { addDays, subDays } from "date-fns"
import { useRef, useState } from "react"
import { useHotkeys } from "react-hotkeys-hook"

import { ShortcutsOverlay } from "@/components/shortcuts/ShortcutsOverlay"
import {
  clearRememberedAgendaItem,
  focusAgendaItem,
  isAgendaItemFocused,
  isInNativeTabScope,
} from "@/components/sidebar/agenda/useAgendaKeyboardNav"
import { openSettingsWindow } from "@/components/toolbar/SettingsButton"
import { SEARCH_BUTTON_EL_ID } from "@/components/toolbar/search/SearchButton"
import { SEARCH_INPUT_EL_ID } from "@/components/toolbar/search/SearchInput"

import { useAgendaSelection } from "@/contexts/AgendaFocusContext"
import { useCalendarNavigation } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

import { useTheme } from "@/hooks/useTheme"
import { CalendarView } from "@/lib/calendar-view"
import { ShortcutBinding, ShortcutId, SHORTCUTS } from "@/lib/shortcuts"

const NAV_THROTTLE_MS = 80

type ShortcutHandler = (e: KeyboardEvent) => void

// Isolated so context updates in the shortcut handlers don't re-render <App />.
export function GlobalShortcuts({
  onChangeCalendarView,
}: {
  onChangeCalendarView: (view: CalendarView) => void
}) {
  const [overlayOpen, setOverlayOpen] = useState(false)

  const handlers = useShortcutHandlers({
    onChangeCalendarView,
    openShortcutsOverlay: () => setOverlayOpen(true),
  })

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
              onTrigger={handlers[shortcut.id]}
            />
          ),
        ),
      )}

      <ShortcutsOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} />
    </>
  )
}

function useShortcutHandlers({
  onChangeCalendarView,
  openShortcutsOverlay,
}: {
  onChangeCalendarView: (view: CalendarView) => void
  openShortcutsOverlay: () => void
}): Record<ShortcutId, ShortcutHandler> {
  const { activeDate, navigateToDate } = useCalendarNavigation()
  const { setSelectedEventKey } = useAgendaSelection()
  const { setIsDrafting, setDefaultDraftEvent } = useEventDraft()
  const { canCreate, promptToConnect } = useCreateEventGate()
  const { toggleTheme } = useTheme()

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

  const handleSearch = (e: KeyboardEvent) => {
    e.preventDefault()

    const input = document.getElementById(SEARCH_INPUT_EL_ID) as HTMLInputElement | null

    if (input) {
      input.focus()
      return
    }

    const button = document.getElementById(SEARCH_BUTTON_EL_ID) as HTMLButtonElement | null
    button?.click()
  }

  const handleNewEvent = (e: KeyboardEvent) => {
    e.preventDefault()

    if (!canCreate) {
      promptToConnect()
      return
    }

    setDefaultDraftEvent()
    setIsDrafting(true)
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
    "focus-agenda": (e) => {
      if (isInNativeTabScope()) return
      e.preventDefault()
      focusAgendaItem(e.shiftKey ? -1 : 1, activeDate)
    },
    month: () => onChangeCalendarView("month"),
    week: () => onChangeCalendarView("week"),
    search: handleSearch,
    "new-event": handleNewEvent,
    settings: (e) => {
      e.preventDefault()
      void openSettingsWindow()
    },
    "toggle-theme": (e) => {
      e.preventDefault()
      toggleTheme()
    },
    shortcuts: (e) => {
      e.preventDefault()
      openShortcutsOverlay()
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

function HotkeyBindingHost({ keys, onTrigger }: { keys: string; onTrigger: ShortcutHandler }) {
  useHotkeys(keys, onTrigger)
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
