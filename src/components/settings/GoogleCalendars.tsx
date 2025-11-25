import { useEffect } from "react"

import { rpc } from "@/rpc"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"

export function GoogleCalendars() {
  const { accessToken, withAuthRetry } = useAuth()

  const { calendars, saveCalendars } = useCalendar()

  useEffect(() => {
    if (accessToken) {
      void fetchCalendars()
    }
  }, [accessToken])

  async function fetchCalendars() {
    const calendars = await withAuthRetry((token) => rpc.fetch_google_calendars(token))
    saveCalendars(calendars)
  }

  return (
    <div>
      <h3>Calendars ({calendars.length})</h3>
      <ul>
        {calendars.map((calendar) => (
          <li key={calendar.id}>
            {calendar.name} {calendar.color && `(${calendar.color})`} {calendar.selected ? "✓" : ""}
          </li>
        ))}
      </ul>
    </div>
  )
}
