import { useEffect, useState } from "react"

import { rpc } from "@/rpc"
import { Calendar } from "@/rpc/bindings"

import { useAuth } from "@/contexts/AuthContext"

export function GoogleEvents() {
  const { accessToken } = useAuth()
  const [calendars, setCalendars] = useState<Calendar[]>([])

  useEffect(() => {
    if (accessToken) {
      void fetchCalendars(accessToken)
    }
  }, [accessToken])

  async function fetchCalendars(accessToken: string) {
    const calendars = await rpc.fetch_google_calendars(accessToken)
    setCalendars(calendars)

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
