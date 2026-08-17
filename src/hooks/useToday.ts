import { Temporal } from "@js-temporal/polyfill"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState } from "react"

import { useViewerTzid } from "@/hooks/useViewerTzid"
import { today as getToday } from "@/lib/event-time"

/**
 * Track current day, to avoid stale "today"
 *
 * Refreshes:
 * - when window regains focus
 * - at next viewer-zone midnight (while the app stays open)
 * - when the OS timezone changes
 */
export function useToday(): Temporal.PlainDate {
  const tzid = useViewerTzid()
  const [today, setToday] = useState(() => getToday())

  useEffect(() => {
    const refresh = () =>
      setToday((prev) => {
        const next = getToday()
        return prev.equals(next) ? prev : next
      })

    // A timezone change can flip the calendar date (this effect re-runs on tzid).
    refresh()

    // Re-check when the window is shown again after being hidden for days.
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) refresh()
    })

    // Re-check at the next viewer-zone midnight while the app stays open, then re-arm.
    let timer: ReturnType<typeof setTimeout>

    const scheduleMidnight = () => {
      const now = Temporal.Now.zonedDateTimeISO(tzid)
      const nextMidnight = now.toPlainDate().add({ days: 1 }).toZonedDateTime(tzid)

      timer = setTimeout(() => {
        refresh()
        scheduleMidnight()
      }, nextMidnight.epochMilliseconds - now.epochMilliseconds)
    }
    scheduleMidnight()

    return () => {
      unlisten.then((fn) => fn())
      clearTimeout(timer)
    }
  }, [tzid])

  return today
}
