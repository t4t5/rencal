import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

import { rpc } from "@/rpc"
import { Calendar } from "@/rpc/bindings"

import { useAuth } from "@/contexts/AuthContext"

export function CalendarConnector() {
  const [calendarResult, setCalendarResult] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [storedCalendars, setStoredCalendars] = useState<Calendar[]>([])

  const { loggedIn, resumeSession, clearSession, saveSession } = useAuth()

  useEffect(() => {
    void resumeSession()
  }, [])

  // async function fetchCalendars(accessToken: string) {
  //   const calendars = await rpc.fetch_google_calendars(accessToken)
  // }
  //
  // async function loadCalendars() {
  //   try {
  //     const db = await Database.load("sqlite:sequence.db")
  //     const result = await db.select<Calendar[]>("SELECT * FROM calendars")
  //     setStoredCalendars(result)
  //   } catch (error) {
  //     console.error("Failed to load calendars:", error)
  //   }
  // }

  async function disconnectGoogle() {
    try {
      await clearSession()
    } catch (error) {
      console.error("Failed to disconnect Google:", error)
    }
  }

  async function connectGoogle() {
    setIsConnecting(true)

    try {
      const session = await rpc.google_oauth()

      await saveSession(session)

      // Step 4: Store calendars in database
      // for (const calendar of calendars) {
      //   await db.execute("INSERT OR REPLACE INTO calendars (id, name, color, selected) VALUES ($1, $2, $3, $4)", [
      //     calendar.id,
      //     calendar.name,
      //     calendar.color || "",
      //     calendar.selected ? 1 : 0,
      //   ])
      // }

      // setCalendarResult(`Connected! Stored ${calendars.length} calendars:\n${calendars.map((c) => c.name).join("\n")}`)

      // Reload calendars from database to update UI
      // await loadCalendars()
    } catch (error) {
      setCalendarResult(`Error: ${error}`)
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="bg-slate-900">
      <h2>Google Calendar Integration</h2>

      {loggedIn ? (
        <Button variant="destructive" onClick={disconnectGoogle}>
          Sign out
        </Button>
      ) : (
        <Button onClick={connectGoogle} disabled={isConnecting}>
          {isConnecting ? "Connecting..." : "Connect Google"}
        </Button>
      )}

      {calendarResult && <pre>{calendarResult}</pre>}

      {storedCalendars.length > 0 && (
        <div>
          <h3>Stored Calendars ({storedCalendars.length})</h3>
          <ul>
            {storedCalendars.map((calendar) => (
              <li key={calendar.id}>
                {calendar.name} {calendar.color && `(${calendar.color})`}{" "}
                {calendar.selected ? "✓" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
