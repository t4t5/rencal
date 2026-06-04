import { addDays, subDays } from "date-fns"
import { useRef, useState } from "react"
import { useHotkeys } from "react-hotkeys-hook"

import { ShortcutsOverlay } from "@/components/shortcuts/ShortcutsOverlay"
import { AGENDA_EL_ID } from "@/components/sidebar/agenda/useAgendaKeyboardNav"
import { openSettingsWindow } from "@/components/toolbar/SettingsButton"
import { SEARCH_BUTTON_EL_ID } from "@/components/toolbar/search/SearchButton"
import { SEARCH_INPUT_EL_ID } from "@/components/toolbar/search/SearchInput"

import { useAgendaFocused } from "@/contexts/AgendaFocusContext"
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
  const { setIsDrafting, setDefaultDraftEvent } = useEventDraft()
  const { canCreate, promptToConnect } = useCreateEventGate()
  const { isFocused: isAgendaFocused } = useAgendaFocused()
  const { toggleTheme } = useTheme()

  const lastNavRef = useRef(0)

  // While the agenda is focused, hjkl/arrows navigate agenda items instead of
  // days/weeks — let the agenda's own handler own them.
  const throttledNavigate = (date: Date) => {
    if (isAgendaFocused) return
    const now = Date.now()
    if (now - lastNavRef.current < NAV_THROTTLE_MS) return
    lastNavRef.current = now
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
    today: () => void navigateToDate(new Date()),
    "prev-day": () => throttledNavigate(subDays(activeDate, 1)),
    "next-day": () => throttledNavigate(addDays(activeDate, 1)),
    "prev-week": () => throttledNavigate(subDays(activeDate, 7)),
    "next-week": () => throttledNavigate(addDays(activeDate, 7)),
    "focus-agenda": (e) => {
      // Tab jumps to the agenda only from the app's resting state (nothing focused).
      // If the user is tabbing through a form — the event popover's date pickers,
      // buttons, etc. — let the browser move focus to the next field instead.
      // (react-hotkeys-hook already skips input/textarea/select, but not buttons.)
      const active = document.activeElement
      if (active && active !== document.body) return
      e.preventDefault()
      document.getElementById(AGENDA_EL_ID)?.focus()
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
