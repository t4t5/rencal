import z from "zod"

import { DEFAULT_VIEW_ID } from "@/views/manifest"

import { useLocalStorage } from "./useLocalStorage"

const CALENDAR_VIEW_KEY = "calendarView"

// Stored as-is: unknown ids fall back at render time, so a plugin view that
// loads late or fails to load doesn't overwrite the user's preference.
export const useCalendarView = () => {
  const [calendarView, setCalendarView] = useLocalStorage(
    CALENDAR_VIEW_KEY,
    z.string(),
    DEFAULT_VIEW_ID,
  )

  return { calendarView, setCalendarView }
}
