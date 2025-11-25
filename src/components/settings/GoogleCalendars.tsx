import { useEffect } from "react"

import { rpc } from "@/rpc"

import { logger } from "@/lib/logger"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"

export function GoogleCalendars() {
  const { accessToken, refreshSession } = useAuth()

  const { calendars, saveCalendars } = useCalendar()

  useEffect(() => {
    if (accessToken) {
      void fetchCalendars(accessToken)
    }
  }, [accessToken])

  async function fetchCalendars(token: string, retries = 0) {
    try {
      const calendars = await rpc.fetch_google_calendars(token)
      saveCalendars(calendars)
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
          await fetchCalendars(newToken, 1)
        }
      } else {
        throw errorMsg
      }
    }
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
