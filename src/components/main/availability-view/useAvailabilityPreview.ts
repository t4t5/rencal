import { useEffect, useRef, useState } from "react"

import { useVisibleCalendarIds } from "@/hooks/cal-events/useVisibleCalendarIds"
import { useViewerTzid } from "@/hooks/useViewerTzid"
import { api, getErrorMessage, type AvailabilityPreview, type AvailabilitySource } from "@/lib/api"

import type { WeekDay } from "@/views/builtin/week/useInfiniteDays"

import { daysRange } from "./day-segments"

const DEBOUNCE_MS = 16

/**
 * What core makes of `source` over the loaded days, with busy time from the
 * calendars the active group shows. Null `source` keeps the last preview
 * (e.g. while the draft is invalid). Refreshes when events, calendars or
 * availabilities change.
 */
export function useAvailabilityPreview(
  source: AvailabilitySource | null,
  days: readonly WeekDay[],
): { preview: AvailabilityPreview | null; error: string | null } {
  const tzid = useViewerTzid()
  const calendarSlugs = useVisibleCalendarIds()
  const [preview, setPreview] = useState<AvailabilityPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const requestRef = useRef(0)

  useEffect(() => {
    const bump = () => setTick((n) => n + 1)
    const subscriptions = (
      ["events-changed", "calendars-changed", "availabilities-changed"] as const
    ).map((name) => api.notifications.listen(name, bump))
    return () => subscriptions.forEach((subscription) => subscription.unlisten())
  }, [])

  const first = days[0]?.date
  const last = days.at(-1)?.date
  // Instants serialize as ISO strings, so the key changes exactly when the request would.
  const key =
    source && first && last ? JSON.stringify([source, calendarSlugs, first, last, tzid]) : null

  useEffect(() => {
    if (!key || !source || !first || !last) return
    const request = ++requestRef.current
    const timeout = setTimeout(() => {
      const { from, to } = daysRange(first, last, tzid)
      api.availability
        .preview(source, calendarSlugs, from, to)
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
    // `key` covers source, calendars and range.
  }, [key, tick])

  return { preview, error }
}
