import { useEffect } from "react"

import { rpc } from "@/rpc"
import { Calendar } from "@/rpc/bindings"

import { logger } from "@/lib/logger"

import { useAuth } from "@/contexts/AuthContext"

interface GoogleEventsProps {
  calendars: Calendar[]
  onCalendarsChange: (calendars: Calendar[]) => void
}

export function GoogleEvents({ calendars, onCalendarsChange }: GoogleEventsProps) {
  const { accessToken, refreshSession } = useAuth()

  useEffect(() => {
    if (accessToken) {
      void fetchCalendars(accessToken)
    } else {
      onCalendarsChange([])
    }
  }, [accessToken])

  async function fetchCalendars(token: string, retries = 0) {
    try {
      const calendars = await rpc.fetch_google_calendars(token)
      onCalendarsChange(calendars)
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

    // for (const calendar of calendars) {
    //   await db.execute("INSERT OR REPLACE INTO calendars (id, name, color, selected) VALUES ($1, $2, $3, $4)", [
    //     calendar.id,
    //     calendar.name,
    //     calendar.color || "",
    //     calendar.selected ? 1 : 0,
    //   ])
    // }
  }

  // async function loadCalendars() {
  //   try {
  //     const db = await Database.load("sqlite:sequence.db")
  //     const result = await db.select<Calendar[]>("SELECT * FROM calendars")
  //     setStoredCalendars(result)
  //   } catch (error) {
  //     console.error("Failed to load calendars:", error)
  //   }
  // }

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
