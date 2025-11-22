import { startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns"
import { useEffect, useState } from "react"

import { DaySection } from "@/components/events/DaySection"

import { rpc } from "@/rpc"
import { Event } from "@/rpc/bindings"

import { logger } from "@/lib/logger"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"

export function EventList({ activeDate }: { activeDate: Date }) {
  const { accessToken, refreshSession } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(false)

  const { calendars } = useCalendar()

  const calendarIds = calendars.filter((c) => c.selected).map((c) => c.id)

  useEffect(() => {
    if (accessToken && calendarIds.length > 0) {
      void fetchEvents(accessToken)
    } else {
      setEvents([])
    }
  }, [accessToken, calendarIds.length])

  async function fetchEvents(token: string, retries = 0) {
    setLoading(true)

    const timeMin = startOfMonth(subMonths(activeDate, 1))
    const timeMax = endOfMonth(addMonths(activeDate, 1))

    try {
      const allEvents: Event[] = []

      for (const calendarId of calendarIds) {
        const calendarEvents = await rpc.fetch_google_events(
          token,
          calendarId,
          timeMin.toISOString(),
          timeMax.toISOString(),
        )
        allEvents.push(...calendarEvents)
      }

      // Sort events by start time
      allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

      setEvents(allEvents)
    } catch (errorMsg) {
      if (retries >= 1) {
        logger.warn("Session retries exhausted!")
        throw errorMsg
      }

      // Check if it's a 401 error (expired token)
      if (typeof errorMsg === "string" && errorMsg.includes("401")) {
        logger.warn("Session expired. Trying to refresh...")

        const newToken = await refreshSession()

        if (newToken) {
          await fetchEvents(newToken, 1)
        }
      } else {
        throw errorMsg
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-2 text-sm text-muted-foreground">Loading events...</div>
  }

  if (events.length === 0) {
    return null
  }

  return (
    <div>
      <DaySection events={events.slice(0, 15)} />
      <DaySection events={events.slice(0, 15)} />
    </div>
  )
}
