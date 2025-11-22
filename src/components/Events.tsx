import { formatDateRange } from "little-date"
import { useEffect, useState } from "react"

import { rpc } from "@/rpc"
import { Event } from "@/rpc/bindings"

import { logger } from "@/lib/logger"

import { useAuth } from "@/contexts/AuthContext"

interface EventListProps {
  activeDate: Date
  calendarIds: string[]
}

export function EventList({ activeDate, calendarIds }: EventListProps) {
  const { accessToken, refreshSession } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (accessToken && calendarIds.length > 0) {
      void fetchEvents(accessToken)
    } else {
      setEvents([])
    }
  }, [accessToken, activeDate, calendarIds])

  async function fetchEvents(token: string, retries = 0) {
    setLoading(true)

    // Calculate time range: activeDate ± 1 month
    const timeMin = new Date(activeDate)
    timeMin.setMonth(timeMin.getMonth() - 1)
    timeMin.setDate(1)
    timeMin.setHours(0, 0, 0, 0)

    const timeMax = new Date(activeDate)
    timeMax.setMonth(timeMax.getMonth() + 2)
    timeMax.setDate(0)
    timeMax.setHours(23, 59, 59, 999)

    try {
      // Fetch events from all calendars
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
      {events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </div>
  )
}

function EventRow({ event }: { event: Event }) {
  const from = new Date(event.start)
  const to = new Date(event.end)

  return (
    <div className="after:bg-primary/70 relative rounded-md p-2 pl-6 text-sm after:absolute after:inset-y-2 after:left-2 after:w-1 after:rounded-full">
      <div className="font-medium">{event.summary}</div>
      <div className="text-muted-foreground text-xs">
        {event.all_day ? "All day" : formatDateRange(from, to)}
      </div>
    </div>
  )
}
