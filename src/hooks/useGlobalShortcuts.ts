import { addDays, subDays } from "date-fns"
import { useRef } from "react"
import { useHotkeys } from "react-hotkeys-hook"

import { openSettingsWindow } from "@/components/header/ActionBar"

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

const NAV_THROTTLE_MS = 80

interface UseGlobalShortcutsOptions {
  setView: (view: "week" | "month") => void
}

export function useGlobalShortcuts({ setView }: UseGlobalShortcutsOptions) {
  const { activeDate, navigateToDate } = useCalendarNavigation()
  const { setIsDrafting, setDefaultDraftEvent } = useEventDraft()

  const lastNavRef = useRef(0)

  const throttledNavigate = (date: Date) => {
    const now = Date.now()
    if (now - lastNavRef.current < NAV_THROTTLE_MS) return
    lastNavRef.current = now
    void navigateToDate(date)
  }

  // Focus search
  useHotkeys("/", (e) => {
    e.preventDefault()
    const input = document.getElementById("global-search") as HTMLInputElement | null
    input?.focus()
  })

  // Alternatives for search
  useHotkeys("mod+f", (e) => {
    e.preventDefault()
    const input = document.getElementById("global-search") as HTMLInputElement | null
    input?.focus()
  })
  useHotkeys("mod+p", (e) => {
    e.preventDefault()
    const input = document.getElementById("global-search") as HTMLInputElement | null
    input?.focus()
  })

  // View switching
  useHotkeys("m", () => setView("month"))
  useHotkeys("w", () => setView("week"))

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
}
