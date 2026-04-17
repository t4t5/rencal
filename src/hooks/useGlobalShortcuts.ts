import { addDays, subDays } from "date-fns"
import { useRef } from "react"
import { useHotkeys } from "react-hotkeys-hook"

import { openSettingsWindow } from "@/components/header/SettingsButton"
import { SEARCH_INPUT_EL_ID } from "@/components/header/search/SearchInput"

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"
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
  const { toggleTheme } = useTheme()

  const lastNavRef = useRef(0)

  const throttledNavigate = (date: Date) => {
    const now = Date.now()
    if (now - lastNavRef.current < NAV_THROTTLE_MS) return
    lastNavRef.current = now
    void navigateToDate(date)
  }

  // Focus search
  useHotkeys("slash", (e) => {
    e.preventDefault()
    const input = document.getElementById(SEARCH_INPUT_EL_ID) as HTMLInputElement | null
    input?.focus()
  })

  // Alternatives for search
  useHotkeys("mod+f", (e) => {
    e.preventDefault()
    const input = document.getElementById(SEARCH_INPUT_EL_ID) as HTMLInputElement | null
    input?.focus()
  })
  useHotkeys("mod+p", (e) => {
    e.preventDefault()
    const input = document.getElementById(SEARCH_INPUT_EL_ID) as HTMLInputElement | null
    input?.focus()
  })

  // View switching
  useHotkeys("m", () => onChangeCalendarView("month"))
  useHotkeys("w", () => onChangeCalendarView("week"))

  // Navigate to today
  useHotkeys("t", () => navigateToDate(new Date()))

  // Navigate previous/next day
  useHotkeys("left", () => throttledNavigate(subDays(activeDate, 1)))
  useHotkeys("right", () => throttledNavigate(addDays(activeDate, 1)))

  // New event
  useHotkeys("c", (e) => {
    e.preventDefault()
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
