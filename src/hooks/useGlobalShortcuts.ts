import { addDays, subDays } from "date-fns"
import { useRef } from "react"
import { useHotkeys } from "react-hotkeys-hook"

import { openSettingsWindow } from "@/components/header-parts/SettingsButton"
import { SEARCH_BUTTON_EL_ID } from "@/components/header-parts/search/SearchButton"
import { SEARCH_INPUT_EL_ID } from "@/components/header-parts/search/SearchInput"

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

import { useTheme } from "@/hooks/useTheme"
import { CalendarView } from "@/lib/calendar-view"

const NAV_THROTTLE_MS = 80

export function useGlobalShortcuts({
  onChangeCalendarView,
}: {
  onChangeCalendarView: (view: CalendarView) => void
}) {
  const { activeDate, navigateToDate } = useCalendarNavigation()
  const { setIsDrafting, setDefaultDraftEvent } = useEventDraft()
  const { canCreate, promptToConnect } = useCreateEventGate()
  const { toggleTheme } = useTheme()

  const lastNavRef = useRef(0)

  const throttledNavigate = (date: Date) => {
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

  // Focus search
  useHotkeys("slash", handleSearch)
  useHotkeys("mod+f", handleSearch)
  useHotkeys("mod+p", handleSearch)

  // View switching
  useHotkeys("m", () => onChangeCalendarView("month"))
  useHotkeys("w", () => onChangeCalendarView("week"))

  // Navigate to today
  useHotkeys("t", () => navigateToDate(new Date()))

  // Navigate previous/next day
  useHotkeys("left", () => throttledNavigate(subDays(activeDate, 1)))
  useHotkeys("right", () => throttledNavigate(addDays(activeDate, 1)))
  useHotkeys("up", () => throttledNavigate(subDays(activeDate, 7)))
  useHotkeys("down", () => throttledNavigate(addDays(activeDate, 7)))

  // vim navigation:
  useHotkeys("h", () => throttledNavigate(subDays(activeDate, 1)))
  useHotkeys("l", () => throttledNavigate(addDays(activeDate, 1)))
  useHotkeys("k", () => throttledNavigate(subDays(activeDate, 7)))
  useHotkeys("j", () => throttledNavigate(addDays(activeDate, 7)))

  // New event
  useHotkeys("c", (e) => {
    e.preventDefault()
    if (!canCreate) {
      promptToConnect()
      return
    }
    setDefaultDraftEvent()
    setIsDrafting(true)
  })

  // Open settings
  useHotkeys("mod+comma", (e) => {
    e.preventDefault()
    void openSettingsWindow()
  })

  // Toggle theme (classic ↔ ren)
  useHotkeys("mod+shift+t", (e) => {
    e.preventDefault()
    toggleTheme()
  })
}
