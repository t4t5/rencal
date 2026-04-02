import { addDays, subDays } from "date-fns"
import { useHotkeys } from "react-hotkeys-hook"

import { openSettingsWindow } from "@/components/header/ActionBar"

import { useCalendarState } from "@/contexts/CalendarStateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

interface UseGlobalShortcutsOptions {
  setView: (view: "week" | "month") => void
}

export function useGlobalShortcuts({ setView }: UseGlobalShortcutsOptions) {
  const { activeDate, navigateToDate } = useCalendarState()
  const { setIsDrafting, setDefaultDraftEvent } = useEventDraft()

  // Focus search
  useHotkeys("mod+f", (e) => {
    e.preventDefault()
    const input = document.getElementById("global-search") as HTMLInputElement | null
    input?.focus()
  })

  useHotkeys("/", (e) => {
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
  useHotkeys("left", () => navigateToDate(subDays(activeDate, 1)))
  useHotkeys("right", () => navigateToDate(addDays(activeDate, 1)))

  // New event
  useHotkeys("n", () => {
    setDefaultDraftEvent()
    setIsDrafting(true)
  })

  // Open settings
  useHotkeys("mod+comma", (e) => {
    e.preventDefault()
    void openSettingsWindow()
  })
}
