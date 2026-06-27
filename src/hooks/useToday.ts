import { getCurrentWindow } from "@tauri-apps/api/window"
import { isSameDay } from "date-fns"
import { useEffect, useState } from "react"

/**
 * Track current day, to avoid stale "today"
 *
 * Refreshes:
 * - when window regains focus
 * - at next local midnight (while the app stays open)
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    const refresh = () =>
      setToday((prev) => {
        const now = new Date()
        return isSameDay(prev, now) ? prev : now
      })

    // Re-check when the window is shown again after being hidden for days.
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) refresh()
    })

    // Re-check at the next local midnight while the app stays open, then re-arm.
    let timer: ReturnType<typeof setTimeout>

    const scheduleMidnight = () => {
      const now = new Date()
      const nextMidnight = new Date(now)

      nextMidnight.setHours(24, 0, 0, 0)

      timer = setTimeout(() => {
        refresh()
        scheduleMidnight()
      }, nextMidnight.getTime() - now.getTime())
    }
    scheduleMidnight()

    return () => {
      unlisten.then((fn) => fn())
      clearTimeout(timer)
    }
  }, [])

  return today
}
