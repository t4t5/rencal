import { useEffect, useRef, useState } from "react"

import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { useViewerTzid } from "@/hooks/useViewerTzid"
import { api, getErrorMessage, type AvailabilityPreview, type AvailabilitySource } from "@/lib/api"

import { daysRange } from "./day-segments"

const DEBOUNCE_MS = 100
// Notice moves with the clock.
const REFRESH_MS = 5 * 60_000

/**
 * What core makes of `source` over the loaded days. Null `source` keeps the
 * last preview (e.g. while the draft is invalid). Refreshes when events,
 * calendars or availabilities change, and every few minutes.
 */
export function useAvailabilityPreview(
  source: AvailabilitySource | null,
  days: readonly MonthDay[],
): { preview: AvailabilityPreview | null; error: string | null } {
  const tzid = useViewerTzid()
  const [preview, setPreview] = useState<AvailabilityPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const requestRef = useRef(0)

  useEffect(() => {
    const bump = () => setTick((n) => n + 1)
    const subscriptions = (
      ["events-changed", "calendars-changed", "availabilities-changed"] as const
    ).map((name) => api.notifications.listen(name, bump))
    const interval = setInterval(bump, REFRESH_MS)
    return () => {
      subscriptions.forEach((subscription) => subscription.unlisten())
      clearInterval(interval)
    }
  }, [])

  const first = days[0]?.date
  const last = days.at(-1)?.date
  // Instants serialize as ISO strings, so the key changes exactly when the request would.
  const key = source && first && last ? JSON.stringify([source, first, last, tzid]) : null

  useEffect(() => {
    if (!key || !source || !first || !last) return
    const request = ++requestRef.current
    const timeout = setTimeout(() => {
      const { from, to } = daysRange(first, last, tzid)
      api.availability
        .preview(source, from, to)
        .then((next) => {
          if (request !== requestRef.current) return
          setPreview(next)
          setError(null)
        })
        .catch((err: unknown) => {
          if (request !== requestRef.current) return
          setError(getErrorMessage(err, "Couldn't compute free times"))
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timeout)
    // `key` covers source and range.
  }, [key, tick])

  return { preview, error }
}
